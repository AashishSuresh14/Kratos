using System.Text.Json;
using Kratos.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Kratos.Infrastructure.Data;

public sealed class KratosDbContext(DbContextOptions<KratosDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AccountGroup> Groups => Set<AccountGroup>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<Stakeholder> Stakeholders => Set<Stakeholder>();
    public DbSet<Opportunity> Opportunities => Set<Opportunity>();
    public DbSet<BrickwallRating> BrickwallRatings => Set<BrickwallRating>();
    public DbSet<ChecklistResponse> ChecklistResponses => Set<ChecklistResponse>();
    public DbSet<ResourceNeed> Resources => Set<ResourceNeed>();
    public DbSet<ActionItem> Actions => Set<ActionItem>();
    public DbSet<PlanVersion> Versions => Set<PlanVersion>();
    public DbSet<Offering> Offerings => Set<Offering>();
    public DbSet<StrategyOption> Strategies => Set<StrategyOption>();
    public DbSet<BrickwallCriterion> BrickwallCriteria => Set<BrickwallCriterion>();
    public DbSet<ChecklistQuestion> ChecklistQuestions => Set<ChecklistQuestion>();
    public DbSet<ScoringWeight> ScoringWeights => Set<ScoringWeight>();
    public DbSet<AiRecommendation> Recommendations => Set<AiRecommendation>();
    public DbSet<AiCallLog> AiCallLogs => Set<AiCallLog>();
    public DbSet<AiEvaluation> AiEvaluations => Set<AiEvaluation>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<SecurityFinding> SecurityFindings => Set<SecurityFinding>();
    public DbSet<ImportSession> Imports => Set<ImportSession>();
    public DbSet<AccountScoreSnapshot> ScoreSnapshots => Set<AccountScoreSnapshot>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b)
    {
        b.Properties<decimal>().HavePrecision(18, 2);
        b.Properties<Enum>().HaveConversion<string>().HaveMaxLength(40);
        b.Properties<string>().HaveMaxLength(4000);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        foreach (var e in b.Model.GetEntityTypes().Where(t => typeof(Entity).IsAssignableFrom(t.ClrType)))
            b.Entity(e.ClrType).Property(nameof(Entity.Id)).ValueGeneratedNever();

        b.Entity<AppUser>(e =>
        {
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Email).HasMaxLength(254);
            e.Property(x => x.PasswordHash).HasMaxLength(500);
        });

        b.Entity<Account>(e =>
        {
            e.HasIndex(x => x.Name).IsUnique();
            e.Property(x => x.Name).HasMaxLength(200);
            e.Property(x => x.RowVersion).IsConcurrencyToken();
            e.Property(x => x.CurrentOfferingIds).HasConversion(JsonConverter<List<Guid>>(), JsonComparer<List<Guid>>()).HasMaxLength(8000);
            e.Property(x => x.AspirationalOfferingIds).HasConversion(JsonConverter<List<Guid>>(), JsonComparer<List<Guid>>()).HasMaxLength(8000);
            e.Property(x => x.StrategyIds).HasConversion(JsonConverter<List<Guid>>(), JsonComparer<List<Guid>>()).HasMaxLength(8000);
            e.Property(x => x.Objectives).HasConversion(JsonConverter<List<string>>(), JsonComparer<List<string>>()).HasMaxLength(12000);
            e.Property(x => x.SectionUpdatedAt).HasConversion(JsonConverter<Dictionary<SectionKey, DateTime>>(), JsonComparer<Dictionary<SectionKey, DateTime>>()).HasMaxLength(4000);
            e.HasMany(x => x.Team).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Stakeholders).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Opportunities).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Brickwall).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Checklist).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Resources).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Actions).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ActionItem>(e =>
        {
            e.HasIndex(x => new { x.AccountId, x.Status });
            e.HasIndex(x => x.OwnerId);
        });
        b.Entity<TeamMember>().HasIndex(x => new { x.AccountId, x.UserId }).IsUnique();
        b.Entity<BrickwallRating>().HasIndex(x => new { x.AccountId, x.CriterionId }).IsUnique();
        b.Entity<ChecklistResponse>().HasIndex(x => new { x.AccountId, x.OpportunityId, x.QuestionId }).IsUnique();
        b.Entity<PlanVersion>(e =>
        {
            e.HasIndex(x => new { x.AccountId, x.Number }).IsUnique();
            e.Property(x => x.SnapshotJson).HasMaxLength(-1);
            e.Property(x => x.ScoresJson).HasMaxLength(-1);
        });
        b.Entity<ScoringWeight>().HasIndex(x => x.Key).IsUnique();
        b.Entity<AiRecommendation>(e =>
        {
            e.HasIndex(x => new { x.AccountId, x.CreatedAt });
            e.Property(x => x.PayloadJson).HasMaxLength(-1);
        });
        b.Entity<AiCallLog>().HasIndex(x => x.At);
        b.Entity<AuditEvent>(e =>
        {
            e.HasIndex(x => x.At);
            e.HasIndex(x => new { x.UserEmail, x.Action, x.At });
        });
        b.Entity<SecurityFinding>().HasIndex(x => x.Fingerprint);
        b.Entity<AccountScoreSnapshot>(e =>
        {
            e.ToTable("AccountScoreSnapshots");
            e.HasIndex(x => new { x.SnapshotDate, x.AccountId }).IsUnique();
        });
        b.Entity<ImportSession>(e =>
        {
            e.Property(x => x.ReportJson).HasMaxLength(-1);
            e.Property(x => x.MappedJson).HasMaxLength(-1);
        });
    }

    private static ValueConverter<T, string> JsonConverter<T>() where T : new() => new(
        v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
        v => string.IsNullOrEmpty(v) ? new T() : JsonSerializer.Deserialize<T>(v, (JsonSerializerOptions?)null) ?? new T());

    private static ValueComparer<T> JsonComparer<T>() => new(
        (a, b) => JsonSerializer.Serialize(a, (JsonSerializerOptions?)null) == JsonSerializer.Serialize(b, (JsonSerializerOptions?)null),
        v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null).GetHashCode(StringComparison.Ordinal),
        v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, (JsonSerializerOptions?)null), (JsonSerializerOptions?)null)!);
}
