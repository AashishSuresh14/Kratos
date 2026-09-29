using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Contracts;
using Kratos.Application.Services;
using Kratos.Domain;
using Kratos.Domain.Scoring;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Kratos.Infrastructure.Data;

/// <summary>
/// Seeds master data, demo users and fictional accounts. All names are invented; no customer data.
/// Each account is built in stages and versioned after each stage, so score trends and diffs are real.
/// </summary>
public static class DataSeeder
{
    public static async Task SeedAsync(IServiceProvider sp, string demoPassword, ILogger logger, CancellationToken ct = default)
    {
        var db = sp.GetRequiredService<KratosDbContext>();
        if (await db.Users.AnyAsync(ct)) return;
        var hasher = sp.GetRequiredService<IPasswordHasher>();
        var now = DateTime.UtcNow;

        // ---- Master data (AC 9) ----
        var offerings = new[]
        {
            ("BI & Analytics", "BI"), ("Data Engineering", "BI"), ("Application Engineering", "App Engg"), ("Cloud Modernisation", "App Engg"),
            ("Integrations & APIs", "Integrations"), ("QA & Test Automation", "QA"), ("AI & Machine Learning", "AI"), ("Managed Support", "Services"),
        }.Select(o => new Offering { Name = o.Item1, Category = o.Item2 }).ToList();
        db.Offerings.AddRange(offerings);

        var strategies = new[]
        {
            ("Cost optimisation", "Reduce run cost of technology and operations"),
            ("Speed to market", "Ship products and features faster"),
            ("Access to scarce skills", "Bring in data, AI or cloud specialists the client cannot hire"),
            ("Legacy modernisation", "Move off ageing platforms with less risk"),
            ("Regulatory compliance", "Meet audit, data and industry regulation"),
            ("Scale engineering capacity", "Add delivery capacity without fixed headcount"),
            ("Data-driven decisions", "Give leaders trustworthy, timely data"),
            ("Better customer experience", "Improve digital journeys for the client's customers"),
        }.Select(s => new StrategyOption { Name = s.Item1, Description = s.Item2 }).ToList();
        db.Strategies.AddRange(strategies);

        var criteria = new (string, BrickwallCategory)[]
        {
            ("Executive sponsorship", BrickwallCategory.Strategic), ("Alignment with client roadmap", BrickwallCategory.Strategic), ("Share of wallet", BrickwallCategory.Strategic),
            ("Trust and credibility", BrickwallCategory.Behavioural), ("Breadth of relationships", BrickwallCategory.Behavioural), ("Responsiveness", BrickwallCategory.Behavioural),
            ("Delivery quality", BrickwallCategory.Operational), ("SLA adherence", BrickwallCategory.Operational), ("Commercial ease", BrickwallCategory.Operational),
        }.Select(c => new BrickwallCriterion { Name = c.Item1, Category = c.Item2, Weight = c.Item2 == BrickwallCategory.Strategic ? 1.5m : 1m }).ToList();
        db.BrickwallCriteria.AddRange(criteria);

        var questions = new (string, ChecklistWeight)[]
        {
            ("Is the budget identified and approved?", ChecklistWeight.Essential),
            ("Have we met the decision maker on this opportunity?", ChecklistWeight.Essential),
            ("Is the business problem confirmed by the client?", ChecklistWeight.Essential),
            ("Do we know which competitors are involved?", ChecklistWeight.Desirable),
            ("Have we shown a demo or proof of concept?", ChecklistWeight.Desirable),
            ("Do we have a relevant reference case?", ChecklistWeight.Desirable),
            ("Do we understand the procurement process?", ChecklistWeight.Useful),
            ("Are success criteria agreed in writing?", ChecklistWeight.Useful),
        }.Select(q => new ChecklistQuestion { Text = q.Item1, Weight = q.Item2 }).ToList();
        db.ChecklistQuestions.AddRange(questions);

        foreach (var (key, def) in WeightKeys.Defaults)
            db.ScoringWeights.Add(new ScoringWeight { Key = key, Label = def.Label, Weight = def.Weight });

        // ---- Users (least privilege: one role each) ----
        AppUser U(string email, string name, Role role) => new() { Email = email, DisplayName = name, Role = role, PasswordHash = hasher.Hash(demoPassword) };
        var admin = U("admin@kratos.demo", "Kavya Admin", Role.Admin);
        var exec = U("exec@kratos.demo", "Rajesh Iyer", Role.Executive);
        var nbdLead = U("nbd.lead@kratos.demo", "Sanjana Rao", Role.GroupLead);
        var ebdLead = U("ebd.lead@kratos.demo", "Vikram Menon", Role.GroupLead);
        var priya = U("priya.am@kratos.demo", "Priya Natarajan", Role.AccountManager);
        var arjun = U("arjun.am@kratos.demo", "Arjun Pillai", Role.AccountManager);
        var deepa = U("deepa.am@kratos.demo", "Deepa Krishnan", Role.AccountManager);
        db.Users.AddRange(admin, exec, nbdLead, ebdLead, priya, arjun, deepa);

        var nbd = new AccountGroup { Name = "New Business (NBD)", LeadUserId = nbdLead.Id };
        var ebd = new AccountGroup { Name = "Existing Business (EBD)", LeadUserId = ebdLead.Id };
        db.Groups.AddRange(nbd, ebd);
        await db.SaveChangesAsync(ct);

        // ---- Fictional accounts ----
        var rnd = new Random(20260929);
        var specs = new (string Name, string Industry, string Region, AccountType Type, AccountGroup Group, AppUser Captain, AppUser? Member, int Maturity)[]
        {
            ("Northgate Retail Group", "Retail", "UK", AccountType.EBD, ebd, priya, arjun, 3),
            ("Altamira Health Network", "Healthcare", "US", AccountType.EBD, ebd, priya, null, 2),
            ("Corvid Financial Services", "Banking", "Singapore", AccountType.EBD, ebd, arjun, priya, 3),
            ("Tessellate Manufacturing", "Manufacturing", "Germany", AccountType.EBD, ebd, arjun, null, 1),
            ("Brightwater Utilities", "Utilities", "Australia", AccountType.EBD, ebd, deepa, null, 2),
            ("Orion Learning Systems", "EdTech", "India", AccountType.EBD, ebd, deepa, arjun, 3),
            ("Harbourline Freight", "Logistics", "UAE", AccountType.NBD, nbd, priya, deepa, 2),
            ("Quillon Biosciences", "Life Sciences", "US", AccountType.NBD, nbd, deepa, null, 1),
            ("Stratavale Energy", "Energy", "Canada", AccountType.NBD, nbd, arjun, null, 2),
            ("Meridian Crest Insurance", "Insurance", "UK", AccountType.NBD, nbd, nbdLead, priya, 3),
        };

        var firstNames = new[] { "Helen", "Marcus", "Aisha", "Tom", "Grace", "Daniel", "Nadia", "Oliver", "Lina", "Kenji", "Farah", "Paul", "Sofia", "Ravi", "Emma" };
        var lastNames = new[] { "Whitaker", "Osei", "Lindqvist", "Moreau", "Tanaka", "Brennan", "Kowalski", "Haddad", "Fischer", "Castillo", "Rahman", "Duarte" };
        var titles = new (string Title, StakeholderRole Role, Importance Imp)[]
        {
            ("Chief Information Officer", StakeholderRole.DecisionMaker, Importance.A), ("Chief Data Officer", StakeholderRole.DecisionMaker, Importance.A),
            ("VP Engineering", StakeholderRole.Influencer, Importance.A), ("Head of Procurement", StakeholderRole.Gatekeeper, Importance.B),
            ("Director, Digital Products", StakeholderRole.Influencer, Importance.B), ("QA Manager", StakeholderRole.User, Importance.C),
            ("Enterprise Architect", StakeholderRole.Influencer, Importance.B), ("CFO", StakeholderRole.DecisionMaker, Importance.A),
        };
        var motives = new[] { "Reduce reporting cycle time", "De-risk a platform migration", "Cut vendor count", "Show AI value to the board", "Improve release quality", "Meet a regulatory deadline" };
        var oppTitles = new[] { "Enterprise data platform", "Test automation CoE", "Customer 360 dashboard", "API integration layer", "Claims triage AI pilot",
                                "Legacy .NET modernisation", "Managed BI support", "Supply chain analytics", "Mobile app rebuild", "GenAI knowledge assistant" };

        var scoring = sp.GetRequiredService<ScoringService>();
        var accountService = sp.GetRequiredService<AccountService>();

        foreach (var s in specs)
        {
            var a = new Account
            {
                Name = s.Name, Industry = s.Industry, Region = s.Region, Type = s.Type, GroupId = s.Group.Id, CaptainId = s.Captain.Id,
                CreatedAt = now.AddDays(-150), ReviewCadenceDays = 30,
            };
            a.Team.Add(new TeamMember { AccountId = a.Id, UserId = s.Captain.Id, Raci = Raci.A, Responsibility = "Account captain" });
            if (s.Member is not null) a.Team.Add(new TeamMember { AccountId = a.Id, UserId = s.Member.Id, Raci = Raci.R, Responsibility = "Delivery relationship" });
            if (s.Group.LeadUserId != s.Captain.Id) a.Team.Add(new TeamMember { AccountId = a.Id, UserId = s.Group.LeadUserId, Raci = Raci.C, Responsibility = "Group lead" });
            a.Team.Add(new TeamMember { AccountId = a.Id, UserId = exec.Id, Raci = Raci.I, Responsibility = "Executive sponsor" });

            // Stage 1: KYC, info base, stakeholders.
            a.AccountSince = s.Type == AccountType.EBD ? DateOnly.FromDateTime(now.AddYears(-rnd.Next(1, 7))) : null;
            a.CurrentRunRate = s.Type == AccountType.EBD ? rnd.Next(4, 60) * 25_000m : null;
            a.CxoConnect = s.Maturity >= 2 ? "Quarterly review with the CIO; informal access to the CDO." : "";
            a.Challenges = $"{s.Industry} margins under pressure; fragmented data across business units; slow release cycles.";
            a.CurrentOfferingIds = s.Type == AccountType.EBD ? offerings.OrderBy(_ => rnd.Next()).Take(rnd.Next(1, 3)).Select(o => o.Id).ToList() : [];
            a.AspirationalOfferingIds = offerings.Select(o => o.Id).Except(a.CurrentOfferingIds).OrderBy(_ => rnd.Next()).Take(2).ToList();
            a.Unknowns = "Budget cycle timing for FY27; who owns the AI roadmap.";
            a.KnownUnconfirmed = s.Maturity >= 2 ? "A platform consolidation programme may start next quarter." : "";
            a.GrowthLevers = s.Maturity >= 3 ? "Strong delivery record on the current engagement; CIO is a reference." : "";
            var stakeholderCount = 3 + s.Maturity;
            foreach (var t in titles.OrderBy(_ => rnd.Next()).Take(stakeholderCount))
            {
                a.Stakeholders.Add(new Stakeholder
                {
                    AccountId = a.Id, Name = $"{firstNames[rnd.Next(firstNames.Length)]} {lastNames[rnd.Next(lastNames.Length)]}", Title = t.Title, Role = t.Role,
                    Importance = t.Imp, BuyingMotive = motives[rnd.Next(motives.Length)], Perception = s.Maturity == 1 && t.Role == StakeholderRole.DecisionMaker ? 2 : rnd.Next(2, 6),
                    PerceptionVsCompetitors = rnd.Next(3) == 0 ? "Sees us as more expensive than the incumbent" : "Rates our engineering above peers",
                    Knowledge = (Knowledge)rnd.Next(0, 3),
                });
            }
            a.SectionUpdatedAt[SectionKey.Profile] = now.AddDays(-120);
            a.SectionUpdatedAt[SectionKey.Infobase] = now.AddDays(-120);
            a.SectionUpdatedAt[SectionKey.Stakeholders] = now.AddDays(-120);
            db.Accounts.Add(a);
            await db.SaveChangesAsync(ct);
            await VersionAsync(db, scoring, accountService, a, s.Captain.Id, now.AddDays(-120), "Initial plan from KAM workbook", ct);

            // Stage 2: vision, strategy, opportunities.
            a.VisionThreeYear = $"Become {s.Name}'s primary partner for data and application engineering.";
            a.VisionOneYear = s.Maturity >= 2 ? "Win one new offering line and expand the delivery team by 30%." : "Land a first paid engagement.";
            a.Objectives = ["Secure an executive sponsor", "Deliver a proof of value within 90 days", "Grow run rate by 25%"];
            a.StrategyIds = strategies.OrderBy(_ => rnd.Next()).Take(2 + rnd.Next(2)).Select(x => x.Id).ToList();
            foreach (var title in oppTitles.OrderBy(_ => rnd.Next()).Take(2 + s.Maturity))
            {
                a.Opportunities.Add(new Opportunity
                {
                    AccountId = a.Id, Title = title, OfferingId = a.AspirationalOfferingIds.Concat(offerings.Select(o => o.Id)).ElementAt(rnd.Next(3)),
                    Potential = rnd.Next(2, 6), Effort = rnd.Next(1, 5), Complexity = rnd.Next(1, 5), EstimatedValue = rnd.Next(2, 40) * 10_000m,
                });
            }
            foreach (var o in a.Opportunities.OrderByDescending(o => o.Potential).Take(Math.Min(2, s.Maturity))) o.IsPriority = true;
            var stage2 = now.AddDays(s.Maturity == 1 ? -75 : -60);
            a.SectionUpdatedAt[SectionKey.Vision] = stage2;
            a.SectionUpdatedAt[SectionKey.Strategy] = stage2;
            a.SectionUpdatedAt[SectionKey.Opportunities] = stage2;
            await db.SaveChangesAsync(ct);
            await VersionAsync(db, scoring, accountService, a, s.Captain.Id, stage2, "Added vision and opportunity matrix", ct);

            // Stage 3 (mature accounts): brickwall, checklist, actions, resources.
            if (s.Maturity >= 2)
            {
                foreach (var c in criteria.Take(s.Maturity == 3 ? criteria.Count : 6))
                    a.Brickwall.Add(new BrickwallRating { AccountId = a.Id, CriterionId = c.Id, Score = Math.Clamp(rnd.Next(2, 6) - (s.Maturity == 2 ? 1 : 0), 1, 5) });
                foreach (var o in a.Opportunities.Where(o => o.IsPriority))
                    foreach (var q in questions.Take(s.Maturity == 3 ? questions.Count : 5))
                        a.Checklist.Add(new ChecklistResponse { AccountId = a.Id, OpportunityId = o.Id, QuestionId = q.Id, Answer = (ChecklistAnswer)rnd.Next(0, 3) });
                a.Resources.Add(new ResourceNeed { AccountId = a.Id, Type = ResourceType.Expertise, Description = "Solution architect for the discovery workshop" });
                a.Resources.Add(new ResourceNeed { AccountId = a.Id, Type = ResourceType.Travel, Description = "Two on-site visits this quarter", Amount = 6000 });
                if (s.Maturity == 3) a.Resources.Add(new ResourceNeed { AccountId = a.Id, Type = ResourceType.ManagementTime, Description = "Executive connect with the CIO", Amount = null });
            }
            var today = DateOnly.FromDateTime(now);
            foreach (var (o, i) in a.Opportunities.Where(o => o.IsPriority).Select((o, i) => (o, i)))
            {
                var parent = new ActionItem
                {
                    AccountId = a.Id, Title = $"Run discovery workshop for {o.Title}", SourceSection = SectionKey.PriorityActions, OpportunityId = o.Id,
                    OwnerId = s.Captain.Id, DueDate = today.AddDays(s.Maturity == 1 ? -12 : 14 + i * 7), CreatedAt = now.AddDays(-40),
                };
                a.Actions.Add(parent);
                a.Actions.Add(new ActionItem
                {
                    AccountId = a.Id, Title = "Share agenda and pre-read with the client", SourceSection = SectionKey.ActionPlan, OpportunityId = o.Id,
                    OwnerId = s.Member?.Id ?? s.Captain.Id, DueDate = parent.DueDate.AddDays(-5), ParentId = parent.Id, CreatedAt = now.AddDays(-40),
                    Status = s.Maturity == 3 ? ActionStatus.Done : ActionStatus.Open, CompletedAt = s.Maturity == 3 ? now.AddDays(-10) : null,
                });
            }
            if (s.Maturity <= 2)
                a.Actions.Add(new ActionItem
                {
                    AccountId = a.Id, Title = "Confirm FY27 budget owner", SourceSection = SectionKey.Infobase, OwnerId = s.Captain.Id,
                    DueDate = today.AddDays(-rnd.Next(3, 20)), CreatedAt = now.AddDays(-45),
                });
            var stage3 = s.Maturity == 3 ? now.AddDays(-8) : s.Maturity == 2 ? now.AddDays(-25) : now.AddDays(-50);
            foreach (var k in new[] { SectionKey.Brickwall, SectionKey.Tactical, SectionKey.PriorityActions, SectionKey.ActionPlan, SectionKey.Resources })
                if (s.Maturity >= 2 || k is SectionKey.PriorityActions or SectionKey.ActionPlan) a.SectionUpdatedAt[k] = stage3;
            if (s.Maturity == 3) foreach (var k in a.SectionUpdatedAt.Keys.ToList()) a.SectionUpdatedAt[k] = stage3;
            await db.SaveChangesAsync(ct);
            if (s.Maturity >= 2) await VersionAsync(db, scoring, accountService, a, s.Captain.Id, stage3, "Brickwall, checklist and action plan", ct);

            // Restore section dates (versioning resets them) so staleness reflects the stage history.
            a.LastReviewedAt = s.Maturity >= 2 ? stage3 : stage2;
            if (s.Maturity < 3)
            {
                a.SectionUpdatedAt[SectionKey.Profile] = now.AddDays(-120);
                a.SectionUpdatedAt[SectionKey.Stakeholders] = now.AddDays(-120);
                a.SectionUpdatedAt[SectionKey.Infobase] = now.AddDays(-120);
            }
            a.UpdatedAt = stage3;
            await db.SaveChangesAsync(ct);
        }
        logger.LogInformation("Seeded demo data: {Accounts} fictional accounts, 7 users.", specs.Length);
    }

    private static async Task VersionAsync(KratosDbContext db, ScoringService scoring, AccountService accountService, Account a, Guid by, DateTime at, string summary, CancellationToken ct)
    {
        var plan = await accountService.ToPlanAsync(a, ct);
        var sectionDates = new Dictionary<SectionKey, DateTime>(a.SectionUpdatedAt);
        a.CurrentVersion += 1;
        db.Versions.Add(new PlanVersion
        {
            AccountId = a.Id, Number = a.CurrentVersion, CreatedAt = at, CreatedById = by, ChangeSummary = summary,
            SnapshotJson = JsonSerializer.Serialize(plan, Json.Options), ScoresJson = JsonSerializer.Serialize(plan.Scores, Json.Options),
        });
        a.SectionUpdatedAt = sectionDates;
        await db.SaveChangesAsync(ct);
    }
}
