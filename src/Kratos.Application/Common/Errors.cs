namespace Kratos.Application.Common;

/// <summary>Resource missing or not visible to the caller. Deliberately the same for both, so existence does not leak.</summary>
public sealed class NotFoundException(string resource) : Exception($"{resource} was not found.");

public sealed class ForbiddenException(string message = "You do not have access to do this.") : Exception(message);

public sealed class ConflictException(string message) : Exception(message);

public sealed class ValidationException : Exception
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(string field, string message) : base(message)
        => Errors = new Dictionary<string, string[]> { [field] = [message] };

    public ValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("One or more fields are invalid.") => Errors = errors;
}

public sealed class TooManyRequestsException(string message) : Exception(message);

/// <summary>Collects field errors, then throws once.</summary>
public sealed class Validator
{
    private readonly Dictionary<string, List<string>> _errors = [];

    public Validator Require(bool ok, string field, string message)
    {
        if (!ok)
        {
            if (!_errors.TryGetValue(field, out var list)) _errors[field] = list = [];
            list.Add(message);
        }
        return this;
    }

    public Validator Text(string? value, string field, int max, bool required = false)
    {
        if (required) Require(!string.IsNullOrWhiteSpace(value), field, "This field is required.");
        return Require((value?.Length ?? 0) <= max, field, $"Must be {max} characters or fewer.");
    }

    public Validator Range(int? value, string field, int min, int max, bool required = false)
    {
        if (required) Require(value.HasValue, field, "This field is required.");
        return Require(value is null || (value >= min && value <= max), field, $"Must be between {min} and {max}.");
    }

    public void ThrowIfInvalid()
    {
        if (_errors.Count > 0)
            throw new ValidationException(_errors.ToDictionary(k => k.Key, v => v.Value.ToArray()));
    }
}

public static class Limits
{
    public const int Name = 200;
    public const int ShortText = 500;
    public const int LongText = 4000;
    public const int MaxObjectives = 20;
    public const int MaxImportBytes = 10 * 1024 * 1024;
    public const int MaxCellsPerSheet = 20_000;
    public const int MaxCopilotInstruction = 1000;
}
