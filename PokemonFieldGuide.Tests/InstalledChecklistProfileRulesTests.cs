using System.Text.Json;

using Microsoft.Extensions.DependencyInjection;

using PokemonFieldGuide.Services;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class InstalledChecklistProfileRulesTests
{
    private const string ProgressMarker = "SPECIES_REGISTRATION_REGRESSION";

    [Fact]
    public void Every_installed_package_has_registered_checklist_profile_rules()
    {
        var catalog = InstalledCatalog();
        var registeredPackageIds = RegisteredProfileRules().Select(rules => rules.PackageId).ToArray();

        Assert.Equal(catalog.Games.Select(game => game.Id).Order(), registeredPackageIds.Order());
    }

    [Theory]
    [InlineData("rs", "Ruby")]
    [InlineData("rs", "Sapphire")]
    [InlineData("emerald", "Emerald")]
    public async Task Opening_an_installed_hoenn_profile_preserves_nonempty_progress(
        string packageId,
        string versionId)
    {
        var catalog = InstalledCatalog();
        var storage = new MemoryLocalGuideStorage(LocalState(packageId, versionId));
        var module = new LocalGuideStateModule(storage, RegisteredProfileRules());

        var opened = Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(catalog));

        Assert.True(opened.Session.Current.Checklist.IsCaught(ProgressMarker));
        using var saved = JsonDocument.Parse(storage.RawText!);
        var savedProfile = saved.RootElement.GetProperty("profiles").GetProperty($"{packageId}:{versionId}");
        Assert.Contains(
            savedProfile.GetProperty("caught").EnumerateArray(),
            value => value.GetString() == ProgressMarker);
    }

    [Theory]
    [InlineData("rs", "Ruby")]
    [InlineData("rs", "Sapphire")]
    [InlineData("emerald", "Emerald")]
    public async Task Portable_backup_import_recognizes_installed_hoenn_profiles(
        string packageId,
        string versionId)
    {
        var catalog = InstalledCatalog();
        var module = new LocalGuideStateModule(new MemoryLocalGuideStorage(), RegisteredProfileRules());
        var session = Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(catalog)).Session;
        var profileId = new ChecklistProfileId(packageId, versionId);

        var preview = Assert.IsType<PortableBackupPreviewResult.Ready>(
            session.PreviewPortableBackup(PortableBackup(packageId, versionId)));
        Assert.Equal(profileId, Assert.Single(preview.Preview.Profiles).ProfileId);

        Assert.IsType<LocalGuideChangeResult.Applied>(
            await session.ImportPortableBackupAsync(preview.Preview, [profileId]));
        Assert.IsType<LocalGuideChangeResult.Applied>(
            await session.SelectPlayableGameAsync(packageId, versionId));
        Assert.True(session.Current.Checklist.IsCaught(ProgressMarker));
    }

    private static IReadOnlyList<IChecklistProfileRules> RegisteredProfileRules()
    {
        var services = new ServiceCollection();
        Program.AddChecklistProfileRules(services);
        using var provider = services.BuildServiceProvider();
        return provider.GetServices<IChecklistProfileRules>().ToArray();
    }

    private static GameCatalog InstalledCatalog()
    {
        var path = Path.Combine(RepositoryRoot(), "PokemonFieldGuide", "wwwroot", "games", "catalog.json");
        return JsonSerializer.Deserialize<GameCatalog>(File.ReadAllText(path), PokemonFieldGuideJson.Options)
            ?? throw new InvalidOperationException($"{path} deserialized to null.");
    }

    private static string LocalState(string packageId, string versionId) => $$"""
        {
          "formatVersion": 1,
          "gameId": "{{packageId}}",
          "version": "{{versionId}}",
          "profiles": {
            "{{packageId}}:{{versionId}}": {
              "caught": ["{{ProgressMarker}}"],
              "collected": [],
              "completedSpecial": []
            }
          },
          "profileVersions": { "{{packageId}}:{{versionId}}": 2 }
        }
        """;

    private static string PortableBackup(string packageId, string versionId) => $$"""
        {
          "format": "pokemon-field-guide-backup",
          "formatVersion": 2,
          "games": {
            "{{packageId}}": {
              "profileVersions": { "{{versionId}}": 2 },
              "profiles": {
                "{{versionId}}": {
                  "caught": ["{{ProgressMarker}}"],
                  "collected": [],
                  "completedSpecial": []
                }
              }
            }
          }
        }
        """;

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "global.json"))) return directory.FullName;
        }
        throw new InvalidOperationException("Could not find the repository root containing global.json.");
    }
}
