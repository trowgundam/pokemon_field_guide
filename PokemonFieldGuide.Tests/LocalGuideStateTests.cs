using System.Text.Json;
using PokemonFieldGuide.Models;
using PokemonFieldGuide.Services;
using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class LocalGuideStateTests
{
    [Fact]
    public async Task Failed_write_does_not_publish_a_checklist_change()
    {
        var storage = new MemoryLocalGuideStorage();
        var module = new LocalGuideStateModule(storage, TestProfileRules.All);
        var opened = Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(Catalog()));
        storage.FailNextWrite = true;

        var result = await opened.Session.ToggleCaughtAsync("SPECIES_PIKACHU");

        Assert.IsType<LocalGuideChangeResult.StorageFailed>(result);
        Assert.False(opened.Session.Current.Checklist.IsCaught("SPECIES_PIKACHU"));
        Assert.DoesNotContain("SPECIES_PIKACHU", storage.RawText ?? "");
    }

    [Fact]
    public async Task Open_migrates_v1_profiles_without_removing_existing_progress()
    {
        var storage = new MemoryLocalGuideStorage("""
            {
              "formatVersion": 1,
              "gameId": "test",
              "version": "Red",
              "theme": "Dark",
              "animationsEnabled": true,
              "dexMode": "Normal",
              "selectedVersions": { "test": "Red" },
              "selectedDexModes": { "test": "Normal" },
              "profiles": {
                "test:Red": {
                  "caught": ["SPECIES_PIKACHU", "UNKNOWN_SPECIES"],
                  "collected": ["UNKNOWN_ITEM"],
                  "completedSpecial": ["gift:pikachu"]
                }
              },
              "profileVersions": { "test:Red": 1 }
            }
            """);
        var module = new LocalGuideStateModule(storage, TestProfileRules.All);

        var opened = Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(Catalog()));

        Assert.True(opened.Session.Current.Checklist.IsCaught("SPECIES_PIKACHU"));
        Assert.True(opened.Session.Current.Checklist.IsCaught("UNKNOWN_SPECIES"));
        Assert.True(opened.Session.Current.Checklist.IsCollected("UNKNOWN_ITEM"));
        Assert.True(opened.Session.Current.Checklist.IsSpecialCompleted("gift:pikachu"));
        Assert.Contains("\"test:Red\":2", storage.RawText);
    }

    [Fact]
    public async Task Malformed_local_data_is_downloadable_until_the_user_deletes_it()
    {
        const string malformed = "{ definitely not json";
        var storage = new MemoryLocalGuideStorage(malformed);
        var module = new LocalGuideStateModule(storage, TestProfileRules.All);

        var opened = Assert.IsType<LocalGuideOpenResult.RecoveryRequired>(await module.OpenAsync(Catalog()));

        Assert.Equal(malformed, opened.Recovery.RawText);
        Assert.Equal(malformed, storage.RawText);
        var deleted = Assert.IsType<LocalGuideChangeResult.Applied>(await opened.Recovery.DeleteAndStartFreshAsync());
        Assert.Null(storage.RawText);
        Assert.Equal("test", deleted.State.ActivePackageId);
    }

    [Fact]
    public async Task Special_acquisitions_do_not_erase_direct_caught_marks()
    {
        var session = await ReadySession();

        await session.ToggleCaughtAsync("SPECIES_PIKACHU");
        await session.ToggleSpecialAsync("gift:pikachu", "SPECIES_PIKACHU");
        await session.ToggleSpecialAsync("gift:pikachu", "SPECIES_PIKACHU");
        await session.ToggleSpecialAsync("gift:eevee", "SPECIES_EEVEE");
        await session.ToggleSpecialAsync("trade:eevee", "SPECIES_EEVEE");

        Assert.True(session.Current.Checklist.IsCaught("SPECIES_PIKACHU"));
        Assert.True(session.Current.Checklist.IsCaught("SPECIES_EEVEE"));

        await session.ToggleSpecialAsync("gift:eevee", "SPECIES_EEVEE");

        Assert.True(session.Current.Checklist.IsCaught("SPECIES_EEVEE"));

        await session.ToggleSpecialAsync("trade:eevee", "SPECIES_EEVEE");

        Assert.False(session.Current.Checklist.IsCaught("SPECIES_EEVEE"));
    }

    [Fact]
    public async Task Backup_v2_contains_selected_empty_profiles_and_no_preferences_or_timestamp()
    {
        var session = await ReadySession();

        var backup = session.CreatePortableBackup([new ChecklistProfileId("test", "Red")]);
        using var document = JsonDocument.Parse(backup.Contents);
        var root = document.RootElement;

        Assert.Equal(2, root.GetProperty("formatVersion").GetInt32());
        Assert.False(root.TryGetProperty("exportedAt", out _));
        var game = root.GetProperty("games").GetProperty("test");
        Assert.False(game.TryGetProperty("selectedVersion", out _));
        Assert.False(game.TryGetProperty("selectedDexMode", out _));
        Assert.True(game.GetProperty("profiles").TryGetProperty("Red", out _));
    }

    [Fact]
    public async Task Selective_reset_clears_only_selected_profiles_and_preserves_preferences()
    {
        var session = await ReadySession();
        await session.ToggleCaughtAsync("SPECIES_RED");
        await session.SelectPlayableGameAsync("test", "Blue");
        await session.ToggleCaughtAsync("SPECIES_BLUE");
        await session.SetThemeAsync("Light");

        var reset = await session.ResetProfilesAsync([new ChecklistProfileId("test", "Red")]);

        Assert.IsType<LocalGuideChangeResult.Applied>(reset);
        Assert.Equal("Light", session.Current.Theme);
        Assert.True(session.Current.Checklist.IsCaught("SPECIES_BLUE"));
        await session.SelectPlayableGameAsync("test", "Red");
        Assert.False(session.Current.Checklist.IsCaught("SPECIES_RED"));
    }

    [Fact]
    public async Task Partial_import_replaces_only_confirmed_profiles_and_ignores_v1_preferences()
    {
        var session = await ReadySession();
        await session.ToggleCaughtAsync("LOCAL_RED");
        await session.SelectPlayableGameAsync("test", "Blue");
        await session.ToggleCaughtAsync("LOCAL_BLUE");
        await session.SelectPlayableGameAsync("test", "Red");
        const string backup = """
            {
              "format": "pokemon-field-guide-backup",
              "formatVersion": 1,
              "games": {
                "test": {
                  "selectedVersion": "Blue",
                  "selectedDexMode": "Other",
                  "profileVersions": { "Red": 1, "Blue": 1 },
                  "profiles": {
                    "Red": { "caught": [], "collected": [], "completedSpecial": [] },
                    "Blue": { "caught": ["IMPORTED_BLUE"], "collected": [], "completedSpecial": [] }
                  }
                }
              }
            }
            """;

        var preview = Assert.IsType<PortableBackupPreviewResult.Ready>(session.PreviewPortableBackup(backup));
        var imported = await session.ImportPortableBackupAsync(
            preview.Preview,
            [new ChecklistProfileId("test", "Blue")]);

        Assert.IsType<LocalGuideChangeResult.Applied>(imported);
        Assert.Equal("Red", session.Current.ActiveVersionId);
        Assert.Equal("Normal", session.Current.ActiveDexModeId);
        Assert.True(session.Current.Checklist.IsCaught("LOCAL_RED"));
        await session.SelectPlayableGameAsync("test", "Blue");
        Assert.True(session.Current.Checklist.IsCaught("IMPORTED_BLUE"));
        Assert.False(session.Current.Checklist.IsCaught("LOCAL_BLUE"));
    }

    [Fact]
    public async Task Concurrent_changes_are_committed_in_order()
    {
        var firstWriteStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseFirstWrite = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var writeCount = 0;
        var storage = new MemoryLocalGuideStorage
        {
            BeforeWriteAsync = async () =>
            {
                if (Interlocked.Increment(ref writeCount) != 1)
                {
                    return;
                }
                firstWriteStarted.SetResult();
                await releaseFirstWrite.Task;
            }
        };
        var module = new LocalGuideStateModule(storage, TestProfileRules.All);
        var session = Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(Catalog())).Session;

        var first = session.ToggleCaughtAsync("FIRST");
        await firstWriteStarted.Task;
        var second = session.ToggleCaughtAsync("SECOND");
        releaseFirstWrite.SetResult();
        await Task.WhenAll(first, second);

        Assert.True(session.Current.Checklist.IsCaught("FIRST"));
        Assert.True(session.Current.Checklist.IsCaught("SECOND"));
        Assert.Equal(2, writeCount);
    }

    private static async Task<LocalGuideSession> ReadySession()
    {
        var module = new LocalGuideStateModule(new MemoryLocalGuideStorage(), TestProfileRules.All);
        return Assert.IsType<LocalGuideOpenResult.Ready>(await module.OpenAsync(Catalog())).Session;
    }

    private static GameCatalog Catalog() => new()
    {
        DefaultGameId = "test",
        Games =
        [
            new GameDefinition
            {
                Id = "test",
                Name = "Test package",
                ShortName = "Test",
                Versions =
                [
                    new() { Id = "Red", Name = "Red", ProgressVersion = 2 },
                    new() { Id = "Blue", Name = "Blue", ProgressVersion = 2 }
                ],
                DexModes =
                [
                    new() { Id = "Normal", Name = "Normal" },
                    new() { Id = "Other", Name = "Other" }
                ]
            }
        ]
    };

    private sealed class TestProfileRules : IChecklistProfileRules
    {
        public static IReadOnlyList<IChecklistProfileRules> All { get; } = [new TestProfileRules()];
        public string PackageId => "test";
    }
}
