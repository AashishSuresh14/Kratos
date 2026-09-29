using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using Kratos.Application.Ai;
using Microsoft.Extensions.Logging;

namespace Kratos.Infrastructure.Ai;

public sealed class ProviderKeys
{
    public const string Section = "Ai:Keys";
    public string? Anthropic { get; set; }
    public string? Gemini { get; set; }
    public string? Groq { get; set; }
    public bool OllamaEnabled { get; set; }
    public string OllamaBaseUrl { get; set; } = "http://localhost:11434";
}

/// <summary>Claude via the official Anthropic SDK. Runs a bounded tool-use loop over read-only tools.</summary>
public sealed class ClaudeProvider(ProviderKeys keys, ILogger<ClaudeProvider> logger) : IAiProvider
{
    private const int MaxToolRounds = 6;
    private AnthropicClient? _client;

    public string Name => "claude";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(keys.Anthropic);
    public bool SupportsTools => true;

    private AnthropicClient Client => _client ??= new AnthropicClient { ApiKey = keys.Anthropic };

    public async Task<AiResult> CompleteAsync(AiRequest request, string model, CancellationToken ct)
    {
        var messages = new List<MessageParam> { new() { Role = Role.User, Content = request.User } };
        var tools = request.Tools ?? [];
        var toolDefs = tools.Select(t => (ToolUnion)new Tool
        {
            Name = t.Name,
            Description = t.Description,
            InputSchema = new InputSchema
            {
                Properties = t.InputSchema.TryGetProperty("properties", out var props)
                    ? props.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone())
                    : new Dictionary<string, JsonElement>(),
            },
        }).ToList();

        var isHaiku = model.Contains("haiku", StringComparison.OrdinalIgnoreCase);
        long input = 0, output = 0;
        var toolCalls = 0;

        for (var round = 0; round <= MaxToolRounds; round++)
        {
            var parameters = new MessageCreateParams
            {
                Model = model,
                MaxTokens = Math.Max(request.MaxTokens, 2000) + (isHaiku ? 0 : 6000),
                System = request.System,
                Messages = messages,
                Tools = toolDefs.Count > 0 ? toolDefs : null,
                OutputConfig = BuildOutputConfig(request, isHaiku, final: toolDefs.Count == 0),
            };

            Message response;
            try
            {
                response = await Client.Messages.Create(parameters, ct);
            }
            catch (AnthropicRateLimitException ex) { throw new AiProviderException(Name, "rate limited", true, ex); }
            catch (Anthropic5xxException ex) { throw new AiProviderException(Name, "service error", true, ex); }
            catch (AnthropicApiException ex) { throw new AiProviderException(Name, $"request rejected ({ex.Message})", false, ex); }
            catch (HttpRequestException ex) { throw new AiProviderException(Name, "network error", true, ex); }
            catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw new AiProviderException(Name, "timed out", true, ex); }

            input += response.Usage.InputTokens;
            output += response.Usage.OutputTokens;
            var stop = response.StopReason?.ToString() ?? "";

            if (stop.Contains("refusal", StringComparison.OrdinalIgnoreCase))
                throw new AiProviderException(Name, "the model declined this request", false);

            var assistant = new List<ContentBlockParam>();
            var results = new List<ContentBlockParam>();
            var text = new List<string>();
            foreach (var block in response.Content)
            {
                if (block.TryPickText(out TextBlock? t))
                {
                    text.Add(t.Text);
                    assistant.Add(new TextBlockParam { Text = t.Text });
                }
                else if (block.TryPickThinking(out ThinkingBlock? th))
                {
                    assistant.Add(new ThinkingBlockParam { Thinking = th.Thinking, Signature = th.Signature });
                }
                else if (block.TryPickRedactedThinking(out RedactedThinkingBlock? rt))
                {
                    assistant.Add(new RedactedThinkingBlockParam { Data = rt.Data });
                }
                else if (block.TryPickToolUse(out ToolUseBlock? tu))
                {
                    assistant.Add(new ToolUseBlockParam { ID = tu.ID, Name = tu.Name, Input = tu.Input });
                    toolCalls++;
                    var tool = tools.FirstOrDefault(x => x.Name == tu.Name);
                    string content;
                    var isError = false;
                    if (tool is null)
                    {
                        content = $"Unknown tool '{tu.Name}'.";
                        isError = true;
                    }
                    else
                    {
                        try
                        {
                            content = await tool.Execute(JsonSerializer.SerializeToElement(tu.Input), ct);
                        }
                        catch (Exception ex) when (ex is not OperationCanceledException)
                        {
                            logger.LogWarning(ex, "Tool {Tool} failed", tu.Name);
                            content = "The tool failed. Continue with the information you have.";
                            isError = true;
                        }
                    }
                    results.Add(new ToolResultBlockParam { ToolUseID = tu.ID, Content = content, IsError = isError });
                }
            }

            if (results.Count == 0)
            {
                if (stop.Contains("max_tokens", StringComparison.OrdinalIgnoreCase) && text.Count == 0)
                    throw new AiProviderException(Name, "response was cut off", true);
                return new AiResult(string.Join("\n", text), Name, model, (int)input, (int)output, 0, false, toolCalls);
            }

            messages.Add(new MessageParam { Role = Role.Assistant, Content = assistant });
            messages.Add(new MessageParam { Role = Role.User, Content = results });

            // After the model has gathered context, ask for the final structured answer without further tool use.
            if (round == MaxToolRounds - 1) toolDefs = [];
        }
        throw new AiProviderException(Name, "too many tool rounds", false);
    }

    private static OutputConfig? BuildOutputConfig(AiRequest request, bool isHaiku, bool final)
    {
        if (request.OutputSchema is not { } schema)
            return isHaiku ? null : new OutputConfig { Effort = Effort.Medium };
        var dict = schema.EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        return isHaiku
            ? new OutputConfig { Format = new JsonOutputFormat { Schema = dict } }
            : new OutputConfig { Effort = Effort.Medium, Format = new JsonOutputFormat { Schema = dict } };
    }
}

internal static class SchemaPrompt
{
    /// <summary>Providers without native structured output get the schema in their instructions.</summary>
    public static string WithSchema(AiRequest r) => r.OutputSchema is { } schema
        ? r.System + "\n\nReturn only one JSON object that validates against this JSON Schema (use exactly these property names and types; arrays must be JSON arrays):\n" + schema.GetRawText()
        : r.System;
}

/// <summary>Google Gemini REST API (generateContent). No function calling here; the gateway inlines tool results.</summary>
public sealed class GeminiProvider(HttpClient http, ProviderKeys keys) : IAiProvider
{
    public string Name => "gemini";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(keys.Gemini);
    public bool SupportsTools => false;

    public async Task<AiResult> CompleteAsync(AiRequest request, string model, CancellationToken ct)
    {
        var generation = new JsonObject { ["maxOutputTokens"] = Math.Max(request.MaxTokens, 8192) };
        if (request.OutputSchema is not null) generation["responseMimeType"] = "application/json";
        var body = new JsonObject
        {
            ["systemInstruction"] = new JsonObject { ["parts"] = new JsonArray(new JsonObject { ["text"] = SchemaPrompt.WithSchema(request) }) },
            ["contents"] = new JsonArray(new JsonObject { ["role"] = "user", ["parts"] = new JsonArray(new JsonObject { ["text"] = request.User }) }),
            ["generationConfig"] = generation,
        };
        using var msg = new HttpRequestMessage(HttpMethod.Post, $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent")
        {
            Content = JsonContent.Create(body),
        };
        msg.Headers.Add("x-goog-api-key", keys.Gemini);
        var json = await Send(http, msg, Name, ct);
        var text = string.Join("", json["candidates"]?[0]?["content"]?["parts"]?.AsArray().Select(p => p?["text"]?.GetValue<string>() ?? "") ?? []);
        if (string.IsNullOrWhiteSpace(text))
            throw new AiProviderException(Name, $"empty response ({json["candidates"]?[0]?["finishReason"]?.GetValue<string>() ?? json["promptFeedback"]?["blockReason"]?.GetValue<string>() ?? "unknown"})", true);
        var usage = json["usageMetadata"];
        return new AiResult(text, Name, model, usage?["promptTokenCount"]?.GetValue<int>() ?? 0,
            (usage?["candidatesTokenCount"]?.GetValue<int>() ?? 0) + (usage?["thoughtsTokenCount"]?.GetValue<int>() ?? 0), 0, false, 0);
    }

    internal static async Task<JsonNode> Send(HttpClient http, HttpRequestMessage msg, string provider, CancellationToken ct)
    {
        HttpResponseMessage res;
        try { res = await http.SendAsync(msg, ct); }
        catch (HttpRequestException ex) { throw new AiProviderException(provider, "network error", true, ex); }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested) { throw new AiProviderException(provider, "timed out", true, ex); }
        using (res)
        {
            var raw = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                var retry = res.StatusCode is HttpStatusCode.TooManyRequests or >= HttpStatusCode.InternalServerError;
                var snippet = raw.Length > 300 ? raw[..300] : raw;
                throw new AiProviderException(provider, $"HTTP {(int)res.StatusCode}: {snippet}", retry);
            }
            return JsonNode.Parse(raw) ?? throw new AiProviderException(provider, "empty body", true);
        }
    }
}

/// <summary>Groq (OpenAI-compatible chat completions) for the low-latency copilot.</summary>
public sealed class GroqProvider(HttpClient http, ProviderKeys keys) : IAiProvider
{
    public string Name => "groq";
    public bool IsConfigured => !string.IsNullOrWhiteSpace(keys.Groq);
    public bool SupportsTools => false;

    public async Task<AiResult> CompleteAsync(AiRequest request, string model, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = model,
            ["max_tokens"] = request.MaxTokens,
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = SchemaPrompt.WithSchema(request) },
                new JsonObject { ["role"] = "user", ["content"] = request.User }),
        };
        if (request.OutputSchema is not null) body["response_format"] = new JsonObject { ["type"] = "json_object" };
        using var msg = new HttpRequestMessage(HttpMethod.Post, "https://api.groq.com/openai/v1/chat/completions") { Content = JsonContent.Create(body) };
        msg.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", keys.Groq);
        var json = await GeminiProvider.Send(http, msg, Name, ct);
        var text = json["choices"]?[0]?["message"]?["content"]?.GetValue<string>() ?? "";
        return new AiResult(text, Name, model, json["usage"]?["prompt_tokens"]?.GetValue<int>() ?? 0, json["usage"]?["completion_tokens"]?.GetValue<int>() ?? 0, 0, false, 0);
    }
}

/// <summary>Local Ollama model: private, offline, used for evaluation and as a last-resort fallback.</summary>
public sealed class OllamaProvider(HttpClient http, ProviderKeys keys) : IAiProvider
{
    public string Name => "ollama";
    public bool IsConfigured => keys.OllamaEnabled;
    public bool SupportsTools => false;

    public async Task<AiResult> CompleteAsync(AiRequest request, string model, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["model"] = model,
            ["stream"] = false,
            ["options"] = new JsonObject { ["num_predict"] = request.MaxTokens },
            ["messages"] = new JsonArray(
                new JsonObject { ["role"] = "system", ["content"] = SchemaPrompt.WithSchema(request) },
                new JsonObject { ["role"] = "user", ["content"] = request.User }),
        };
        if (request.OutputSchema is not null) body["format"] = "json";
        using var msg = new HttpRequestMessage(HttpMethod.Post, $"{keys.OllamaBaseUrl.TrimEnd('/')}/api/chat") { Content = JsonContent.Create(body) };
        var json = await GeminiProvider.Send(http, msg, Name, ct);
        return new AiResult(json["message"]?["content"]?.GetValue<string>() ?? "", Name, model,
            json["prompt_eval_count"]?.GetValue<int>() ?? 0, json["eval_count"]?.GetValue<int>() ?? 0, 0, false, 0);
    }
}
