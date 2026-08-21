using System.Text.Json;

using Microsoft.JSInterop;

namespace PokemonFieldGuide.Services;

internal interface ILocalGuideStorage
{
    Task<string?> ReadAsync(CancellationToken cancellationToken = default);
    Task WriteAsync(string value, CancellationToken cancellationToken = default);
    Task DeleteAsync(CancellationToken cancellationToken = default);
}

internal sealed class BrowserLocalGuideStorage(IJSRuntime javascript) : ILocalGuideStorage
{
    public Task<string?> ReadAsync(CancellationToken cancellationToken = default) =>
        javascript.InvokeAsync<string?>("fieldGuide.storage.read", cancellationToken).AsTask();

    public Task WriteAsync(string value, CancellationToken cancellationToken = default) =>
        javascript.InvokeVoidAsync("fieldGuide.storage.write", cancellationToken, value).AsTask();

    public Task DeleteAsync(CancellationToken cancellationToken = default) =>
        javascript.InvokeVoidAsync("fieldGuide.storage.delete", cancellationToken).AsTask();
}

internal sealed class MemoryLocalGuideStorage(string? rawText = null) : ILocalGuideStorage
{
    public string? RawText { get; private set; } = rawText;
    public bool FailNextWrite { get; set; }
    public Func<Task>? BeforeWriteAsync { get; set; }

    public Task<string?> ReadAsync(CancellationToken cancellationToken = default) => Task.FromResult(RawText);

    public async Task WriteAsync(string value, CancellationToken cancellationToken = default)
    {
        if (BeforeWriteAsync is not null)
        {
            await BeforeWriteAsync();
        }
        if (FailNextWrite)
        {
            FailNextWrite = false;
            throw new InvalidOperationException("The browser rejected the local guide state write.");
        }

        RawText = value;
    }

    public Task DeleteAsync(CancellationToken cancellationToken = default)
    {
        RawText = null;
        return Task.CompletedTask;
    }
}

internal interface IChecklistProfileRules
{
    string PackageId { get; }

    ChecklistProfileData Restore(
        string versionId,
        int storedVersion,
        int targetVersion,
        ChecklistProfileDocument source)
    {
        if (storedVersion > targetVersion)
        {
            throw new InvalidOperationException($"The {versionId} checklist profile is v{storedVersion}, but this guide supports through v{targetVersion}.");
        }

        var profile = storedVersion switch
        {
            1 => ChecklistProfileData.FromV1(source),
            2 => ChecklistProfileData.FromV2(source),
            _ => throw new InvalidOperationException($"The {versionId} checklist profile uses unsupported version {storedVersion}.")
        };

        while (storedVersion < targetVersion)
        {
            profile = storedVersion switch
            {
                1 => profile,
                _ => throw new InvalidOperationException($"No migration exists for {versionId} checklist data from v{storedVersion} to v{storedVersion + 1}.")
            };
            storedVersion++;
        }

        return profile;
    }
}

internal sealed class GamePackageChecklistProfileRules(string packageId) : IChecklistProfileRules
{
    public string PackageId { get; } = packageId;
}

internal sealed class LocalGuideStateModule(
    ILocalGuideStorage storage,
    IEnumerable<IChecklistProfileRules> profileRules)
{
    private readonly IReadOnlyDictionary<string, IChecklistProfileRules> rulesByPackage =
        profileRules.ToDictionary(rules => rules.PackageId);

    public async Task<LocalGuideOpenResult> OpenAsync(
        GameCatalog catalog,
        CancellationToken cancellationToken = default)
    {
        string? raw;
        try
        {
            raw = await storage.ReadAsync(cancellationToken);
        }
        catch (Exception error)
        {
            return new LocalGuideOpenResult.StorageFailed(error.Message);
        }

        if (raw is null)
        {
            return new LocalGuideOpenResult.Ready(new LocalGuideSession(
                storage,
                catalog,
                rulesByPackage,
                LocalGuideStateData.CreateDefault(catalog)));
        }

        RestoredLocalGuideState restored;
        try
        {
            restored = LocalGuideStateData.Restore(raw, catalog, rulesByPackage);
        }
        catch (JsonException error)
        {
            return new LocalGuideOpenResult.RecoveryRequired(new LocalGuideRecovery(
                storage,
                catalog,
                rulesByPackage,
                raw,
                error.Message));
        }
        catch (InvalidOperationException error)
        {
            return new LocalGuideOpenResult.RecoveryRequired(new LocalGuideRecovery(
                storage,
                catalog,
                rulesByPackage,
                raw,
                error.Message));
        }

        if (restored.Changed)
        {
            try
            {
                await storage.WriteAsync(restored.State.Serialize(), cancellationToken);
            }
            catch (Exception error)
            {
                return new LocalGuideOpenResult.StorageFailed(error.Message);
            }
        }

        return new LocalGuideOpenResult.Ready(new LocalGuideSession(
            storage,
            catalog,
            rulesByPackage,
            restored.State));
    }
}

internal abstract record LocalGuideOpenResult
{
    public sealed record Ready(LocalGuideSession Session) : LocalGuideOpenResult;
    public sealed record RecoveryRequired(LocalGuideRecovery Recovery) : LocalGuideOpenResult;
    public sealed record StorageFailed(string Message) : LocalGuideOpenResult;
}

internal sealed class LocalGuideRecovery(
    ILocalGuideStorage storage,
    GameCatalog catalog,
    IReadOnlyDictionary<string, IChecklistProfileRules> rulesByPackage,
    string rawText,
    string message)
{
    public string RawText { get; } = rawText;
    public string Message { get; } = message;

    public async Task<LocalGuideChangeResult> DeleteAndStartFreshAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            await storage.DeleteAsync(cancellationToken);
            var session = new LocalGuideSession(
                storage,
                catalog,
                rulesByPackage,
                LocalGuideStateData.CreateDefault(catalog));
            return new LocalGuideChangeResult.Applied(session.Current, session);
        }
        catch (Exception error)
        {
            return new LocalGuideChangeResult.StorageFailed(error.Message);
        }
    }
}

internal sealed class LocalGuideSession(
    ILocalGuideStorage storage,
    GameCatalog catalog,
    IReadOnlyDictionary<string, IChecklistProfileRules> rulesByPackage,
    LocalGuideStateData state)
{
    private readonly SemaphoreSlim changes = new(1, 1);
    private LocalGuideStateData state = state;

    public LocalGuideSnapshot Current { get; private set; } = LocalGuideSnapshot.From(state);

    public IReadOnlyList<ChecklistProfileSummary> ResetChoices =>
    [
        .. catalog.Games.SelectMany(definition => definition.Versions.Select(version =>
                new ChecklistProfileSummary(
                    new ChecklistProfileId(definition.Id, version.Id),
                    definition.Name,
                    version.Name,
                    state.Profiles.GetValueOrDefault($"{definition.Id}:{version.Id}")?.HasData == true)))
            .Where(choice => choice.HasData)
    ];

    public Task<LocalGuideChangeResult> ToggleCaughtAsync(
        string speciesId,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            var profile = next.ActiveProfile(catalog);
            if (!profile.Caught.Remove(speciesId)
                && !profile.CompletedSpecial.Values.Contains(speciesId))
            {
                profile.Caught.Add(speciesId);
            }
        }, cancellationToken);

    public Task<LocalGuideChangeResult> ToggleCollectedAsync(
        string itemId,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            var profile = next.ActiveProfile(catalog);
            if (!profile.Collected.Add(itemId))
            {
                profile.Collected.Remove(itemId);
            }
        }, cancellationToken);

    public Task<LocalGuideChangeResult> ToggleSpecialAsync(
        string acquisitionId,
        string speciesId,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            var profile = next.ActiveProfile(catalog);
            if (!profile.CompletedSpecial.Remove(acquisitionId))
            {
                profile.CompletedSpecial[acquisitionId] = speciesId;
            }
        }, cancellationToken);

    public Task<LocalGuideChangeResult> SelectPlayableGameAsync(
        string packageId,
        string versionId,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            var game = catalog.Games.FirstOrDefault(candidate => candidate.Id == packageId)
                ?? throw new InvalidOperationException($"The game package '{packageId}' is not installed.");
            var version = game.Versions.FirstOrDefault(candidate => candidate.Id == versionId)
                ?? throw new InvalidOperationException($"The game version '{versionId}' is not installed.");
            next.GameId = game.Id;
            next.Version = version.Id;
            next.SelectedVersions[game.Id] = version.Id;
            var dexMode = game.DexModes.FirstOrDefault(candidate => candidate.Id == next.SelectedDexModes.GetValueOrDefault(game.Id))
                ?? game.DexModes[0];
            next.DexMode = dexMode.Id;
            next.SelectedDexModes[game.Id] = dexMode.Id;
            next.Accent = version.Accent;
            next.ActiveProfile(catalog);
        }, cancellationToken);

    public Task<LocalGuideChangeResult> SetDexModeAsync(
        string dexModeId,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            var game = catalog.Games.First(candidate => candidate.Id == next.GameId);
            if (!game.DexModes.Any(candidate => candidate.Id == dexModeId))
            {
                throw new InvalidOperationException($"The Pokédex mode '{dexModeId}' is not available.");
            }

            next.DexMode = dexModeId;
            next.SelectedDexModes[game.Id] = dexModeId;
        }, cancellationToken);

    public Task<LocalGuideChangeResult> SetThemeAsync(
        string theme,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            if (theme is not ("Dark" or "Light"))
            {
                throw new InvalidOperationException($"The theme '{theme}' is not available.");
            }
            next.Theme = theme;
        }, cancellationToken);

    public Task<LocalGuideChangeResult> SetAnimationsAsync(
        bool enabled,
        CancellationToken cancellationToken = default) => CommitAsync(
            next => next.AnimationsEnabled = enabled,
            cancellationToken);

    public Task<LocalGuideChangeResult> ResetProfilesAsync(
        IReadOnlyCollection<ChecklistProfileId> selectedProfiles,
        CancellationToken cancellationToken = default) => CommitAsync(next =>
        {
            if (selectedProfiles.Count == 0)
            {
                throw new InvalidOperationException("Select at least one checklist profile to reset.");
            }

            foreach (var profileId in selectedProfiles)
            {
                var definition = catalog.Games.FirstOrDefault(game => game.Id == profileId.PackageId);
                var version = definition?.Versions.FirstOrDefault(candidate => candidate.Id == profileId.VersionId)
                    ?? throw new InvalidOperationException($"The checklist profile '{profileId}' is not installed.");
                next.Profiles[profileId.Key] = new ChecklistProfileData();
                next.ProfileVersions[profileId.Key] = version.ProgressVersion;
            }
        }, cancellationToken);

    public PortableBackupFile CreatePortableBackup(IReadOnlyCollection<ChecklistProfileId> selectedProfiles)
    {
        if (selectedProfiles.Count == 0)
        {
            throw new InvalidOperationException("Select at least one checklist profile to back up.");
        }

        var games = new Dictionary<string, PortableBackupGameV2>();
        foreach (var profileId in selectedProfiles)
        {
            var definition = catalog.Games.FirstOrDefault(game => game.Id == profileId.PackageId);
            var version = definition?.Versions.FirstOrDefault(candidate => candidate.Id == profileId.VersionId)
                ?? throw new InvalidOperationException($"The checklist profile '{profileId}' is not installed.");
            if (!games.TryGetValue(profileId.PackageId, out var game))
            {
                game = new PortableBackupGameV2();
                games[profileId.PackageId] = game;
            }

            game.Profiles[profileId.VersionId] = state.Profiles.GetValueOrDefault(profileId.Key)?.Serialize()
                ?? new ChecklistProfileData().Serialize();
            game.ProfileVersions[profileId.VersionId] = version.ProgressVersion;
        }

        var json = JsonSerializer.Serialize(new PortableBackupV2
        {
            Games = games
        }, LocalGuideStateData.JsonOptions);
        return new PortableBackupFile(
            $"pokemon-field-guide-v2-{DateTime.UtcNow:yyyy-MM-dd}.json",
            json);
    }

    public PortableBackupPreviewResult PreviewPortableBackup(string contents)
    {
        if (System.Text.Encoding.UTF8.GetByteCount(contents) > 2 * 1024 * 1024)
        {
            return new PortableBackupPreviewResult.Rejected("The backup is larger than 2 MB.");
        }

        try
        {
            using var document = JsonDocument.Parse(contents);
            var root = document.RootElement;
            if (!root.TryGetProperty("format", out var format)
                || format.GetString() != "pokemon-field-guide-backup")
            {
                return new PortableBackupPreviewResult.Rejected("This is not a Pokemon Field Guide backup.");
            }
            if (!root.TryGetProperty("formatVersion", out var formatVersionElement)
                || !formatVersionElement.TryGetInt32(out var formatVersion)
                || formatVersion is not (1 or 2))
            {
                return new PortableBackupPreviewResult.Rejected("The backup format is not supported by this guide.");
            }
            if (!root.TryGetProperty("games", out var gamesElement)
                || gamesElement.ValueKind != JsonValueKind.Object)
            {
                return new PortableBackupPreviewResult.Rejected("The backup does not contain any games.");
            }

            var imported = new Dictionary<ChecklistProfileId, ChecklistProfileData>();
            var previews = new List<PortableBackupProfilePreview>();
            foreach (var gameProperty in gamesElement.EnumerateObject())
            {
                var definition = catalog.Games.FirstOrDefault(game => game.Id == gameProperty.Name);
                if (definition is null
                    || !rulesByPackage.TryGetValue(definition.Id, out var rules)
                    || !gameProperty.Value.TryGetProperty("profiles", out var profilesElement)
                    || profilesElement.ValueKind != JsonValueKind.Object
                    || !gameProperty.Value.TryGetProperty("profileVersions", out var versionsElement)
                    || versionsElement.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                foreach (var profileProperty in profilesElement.EnumerateObject())
                {
                    var version = definition.Versions.FirstOrDefault(candidate => candidate.Id == profileProperty.Name);
                    if (version is null)
                    {
                        continue;
                    }
                    if (!versionsElement.TryGetProperty(version.Id, out var storedVersionElement)
                        || !storedVersionElement.TryGetInt32(out var storedVersion))
                    {
                        return new PortableBackupPreviewResult.Rejected($"The {version.Name} checklist profile is missing its data version.");
                    }

                    var source = profileProperty.Value.Deserialize<ChecklistProfileDocument>(LocalGuideStateData.JsonOptions)
                        ?? throw new InvalidOperationException("The checklist profile is empty.");
                    var profile = rules.Restore(version.Id, storedVersion, version.ProgressVersion, source);
                    var id = new ChecklistProfileId(definition.Id, version.Id);
                    imported[id] = profile;
                    var existingHasData = state.Profiles.GetValueOrDefault(id.Key)?.HasData == true;
                    var effect = profile.HasData
                        ? existingHasData ? PortableBackupImportEffect.Replace : PortableBackupImportEffect.Add
                        : PortableBackupImportEffect.Clear;
                    previews.Add(new PortableBackupProfilePreview(id, definition.Name, version.Name, effect));
                }
            }

            if (previews.Count == 0)
            {
                return new PortableBackupPreviewResult.Rejected("The backup does not contain any installed game profiles.");
            }

            return new PortableBackupPreviewResult.Ready(new PortableBackupPreview(previews, imported));
        }
        catch (JsonException error)
        {
            return new PortableBackupPreviewResult.Rejected(error.Message);
        }
        catch (InvalidOperationException error)
        {
            return new PortableBackupPreviewResult.Rejected(error.Message);
        }
    }

    public Task<LocalGuideChangeResult> ImportPortableBackupAsync(
        PortableBackupPreview preview,
        IReadOnlyCollection<ChecklistProfileId> selectedProfiles,
        CancellationToken cancellationToken = default)
    {
        if (selectedProfiles.Count == 0)
        {
            return Task.FromResult<LocalGuideChangeResult>(new LocalGuideChangeResult.Rejected(
                "Select at least one checklist profile to import."));
        }

        return CommitAsync(next =>
        {
            foreach (var profileId in selectedProfiles)
            {
                if (!preview.ImportedProfiles.TryGetValue(profileId, out var profile))
                {
                    throw new InvalidOperationException($"The preview does not contain '{profileId}'.");
                }
                var definition = catalog.Games.First(game => game.Id == profileId.PackageId);
                var version = definition.Versions.First(candidate => candidate.Id == profileId.VersionId);
                next.Profiles[profileId.Key] = profile.Clone();
                next.ProfileVersions[profileId.Key] = version.ProgressVersion;
            }
        }, cancellationToken);
    }

    private async Task<LocalGuideChangeResult> CommitAsync(
        Action<LocalGuideStateData> change,
        CancellationToken cancellationToken)
    {
        await changes.WaitAsync(cancellationToken);
        try
        {
            var proposed = state.Clone();
            try
            {
                change(proposed);
            }
            catch (InvalidOperationException error)
            {
                return new LocalGuideChangeResult.Rejected(error.Message);
            }
            try
            {
                await storage.WriteAsync(proposed.Serialize(), cancellationToken);
            }
            catch (Exception error)
            {
                return new LocalGuideChangeResult.StorageFailed(error.Message);
            }

            state = proposed;
            Current = LocalGuideSnapshot.From(state);
            return new LocalGuideChangeResult.Applied(Current, this);
        }
        finally
        {
            changes.Release();
        }
    }
}

internal readonly record struct ChecklistProfileId(string PackageId, string VersionId)
{
    public string Key => $"{PackageId}:{VersionId}";
    public override string ToString() => Key;
}

internal sealed record ChecklistProfileSummary(
    ChecklistProfileId ProfileId,
    string PackageName,
    string VersionName,
    bool HasData);

internal sealed record PortableBackupFile(string SuggestedFileName, string Contents);

internal enum PortableBackupImportEffect
{
    Add,
    Replace,
    Clear
}

internal sealed record PortableBackupProfilePreview(
    ChecklistProfileId ProfileId,
    string PackageName,
    string VersionName,
    PortableBackupImportEffect Effect);

internal sealed class PortableBackupPreview(
    IReadOnlyList<PortableBackupProfilePreview> profiles,
    IReadOnlyDictionary<ChecklistProfileId, ChecklistProfileData> importedProfiles)
{
    public IReadOnlyList<PortableBackupProfilePreview> Profiles { get; } = profiles;
    internal IReadOnlyDictionary<ChecklistProfileId, ChecklistProfileData> ImportedProfiles { get; } = importedProfiles;
}

internal abstract record PortableBackupPreviewResult
{
    public sealed record Ready(PortableBackupPreview Preview) : PortableBackupPreviewResult;
    public sealed record Rejected(string Message) : PortableBackupPreviewResult;
}

internal abstract record LocalGuideChangeResult
{
    public sealed record Applied(LocalGuideSnapshot State, LocalGuideSession Session) : LocalGuideChangeResult;
    public sealed record Rejected(string Message) : LocalGuideChangeResult;
    public sealed record StorageFailed(string Message) : LocalGuideChangeResult;
}

internal sealed class LocalGuideSnapshot(
    string activePackageId,
    string activeVersionId,
    string activeDexModeId,
    string theme,
    bool animationsEnabled,
    ChecklistProfileView checklist)
{
    public static LocalGuideSnapshot Empty { get; } = new(
        "",
        "",
        "",
        "Dark",
        true,
        new ChecklistProfileView(new ChecklistProfileData()));
    public string ActivePackageId { get; } = activePackageId;
    public string ActiveVersionId { get; } = activeVersionId;
    public string ActiveDexModeId { get; } = activeDexModeId;
    public string Theme { get; } = theme;
    public bool AnimationsEnabled { get; } = animationsEnabled;
    public ChecklistProfileView Checklist { get; } = checklist;

    internal static LocalGuideSnapshot From(LocalGuideStateData state) => new(
        state.GameId,
        state.Version,
        state.DexMode,
        state.Theme,
        state.AnimationsEnabled,
        new ChecklistProfileView(state.Profiles[state.ActiveProfileKey()]));
}

internal sealed class ChecklistProfileView(ChecklistProfileData profile)
{
    private readonly HashSet<string> caught = [.. profile.Caught];
    private readonly HashSet<string> collected = [.. profile.Collected];
    private readonly Dictionary<string, string?> completedSpecial = new(profile.CompletedSpecial);

    public bool IsCaught(string speciesId) =>
        caught.Contains(speciesId)
        || completedSpecial.Values.Any(completedSpecies => completedSpecies == speciesId);

    public bool IsCollected(string itemId) => collected.Contains(itemId);
    public bool IsSpecialCompleted(string acquisitionId) => completedSpecial.ContainsKey(acquisitionId);
}

internal sealed class ChecklistProfileData
{
    private static readonly JsonSerializerOptions JsonOptions = PokemonFieldGuideJson.Options;

    public HashSet<string> Caught { get; init; } = [];
    public HashSet<string> Collected { get; init; } = [];
    public Dictionary<string, string?> CompletedSpecial { get; init; } = [];
    public bool HasData => Caught.Count > 0 || Collected.Count > 0 || CompletedSpecial.Count > 0;

    public ChecklistProfileData Clone() => new()
    {
        Caught = [.. Caught],
        Collected = [.. Collected],
        CompletedSpecial = new(CompletedSpecial)
    };

    public ChecklistProfileDocument Serialize() => ChecklistProfileDocument.FromVersion2(new ChecklistProfileV2
    {
        Caught = Caught,
        Collected = Collected,
        CompletedSpecial = [.. CompletedSpecial.Select(pair => new CompletedSpecialV2(pair.Key, pair.Value))]
    });

    public static ChecklistProfileData FromV1(ChecklistProfileDocument source)
    {
        var profile = source.RequireVersion1();
        return new ChecklistProfileData
        {
            Caught = profile.Caught ?? [],
            Collected = profile.Collected ?? [],
            CompletedSpecial = (profile.CompletedSpecial ?? []).ToDictionary(id => id, _ => (string?)null)
        };
    }

    public static ChecklistProfileData FromV2(ChecklistProfileDocument source)
    {
        var profile = source.RequireVersion2();
        var completed = new Dictionary<string, string?>();
        foreach (var acquisition in profile.CompletedSpecial ?? [])
        {
            if (string.IsNullOrWhiteSpace(acquisition.Id) || !completed.TryAdd(acquisition.Id, acquisition.SpeciesId))
            {
                throw new InvalidOperationException("The checklist profile has an invalid special acquisition.");
            }
        }

        return new ChecklistProfileData
        {
            Caught = profile.Caught ?? [],
            Collected = profile.Collected ?? [],
            CompletedSpecial = completed
        };
    }

}

internal sealed class LocalGuideStateData
{
    private const int FormatVersion = 1;
    internal static readonly JsonSerializerOptions JsonOptions = PokemonFieldGuideJson.Options;

    public string GameId { get; set; } = "";
    public string Version { get; set; } = "";
    public string Theme { get; set; } = "Dark";
    public bool AnimationsEnabled { get; set; } = true;
    public string DexMode { get; set; } = "";
    public string Accent { get; set; } = "";
    public Dictionary<string, string> SelectedVersions { get; set; } = [];
    public Dictionary<string, string> SelectedDexModes { get; set; } = [];
    public Dictionary<string, ChecklistProfileData> Profiles { get; set; } = [];
    public Dictionary<string, ChecklistProfileDocument> UnknownProfiles { get; set; } = [];
    public Dictionary<string, int> ProfileVersions { get; set; } = [];

    public static LocalGuideStateData CreateDefault(GameCatalog catalog)
    {
        var game = catalog.Games.First(definition => definition.Id == catalog.DefaultGameId);
        var version = game.Versions[0];
        var dexMode = game.DexModes[0];
        return new LocalGuideStateData
        {
            GameId = game.Id,
            Version = version.Id,
            DexMode = dexMode.Id,
            Accent = version.Accent,
            SelectedVersions = new() { [game.Id] = version.Id },
            SelectedDexModes = new() { [game.Id] = dexMode.Id },
            Profiles = new() { [$"{game.Id}:{version.Id}"] = new() },
            ProfileVersions = new() { [$"{game.Id}:{version.Id}"] = version.ProgressVersion }
        };
    }

    public static RestoredLocalGuideState Restore(
        string raw,
        GameCatalog catalog,
        IReadOnlyDictionary<string, IChecklistProfileRules> rulesByPackage)
    {
        var envelope = JsonSerializer.Deserialize<LocalGuideStateEnvelopeV1>(raw, JsonOptions)
            ?? throw new InvalidOperationException("The local guide state is empty.");
        if (envelope.FormatVersion != FormatVersion)
        {
            throw new InvalidOperationException($"Local guide state format v{envelope.FormatVersion} is not supported by this guide.");
        }

        var state = new LocalGuideStateData
        {
            GameId = envelope.GameId ?? "",
            Version = envelope.Version ?? "",
            Theme = envelope.Theme ?? "Dark",
            AnimationsEnabled = envelope.AnimationsEnabled,
            DexMode = envelope.DexMode ?? "",
            Accent = envelope.Accent ?? "",
            SelectedVersions = envelope.SelectedVersions ?? [],
            SelectedDexModes = envelope.SelectedDexModes ?? [],
            ProfileVersions = envelope.ProfileVersions ?? []
        };
        var changed = false;
        foreach (var (key, source) in envelope.Profiles ?? [])
        {
            var separator = key.IndexOf(':');
            if (separator < 1)
            {
                state.UnknownProfiles[key] = source.Clone();
                continue;
            }

            var packageId = key[..separator];
            var versionId = key[(separator + 1)..];
            var definition = catalog.Games.FirstOrDefault(game => game.Id == packageId);
            var version = definition?.Versions.FirstOrDefault(candidate => candidate.Id == versionId);
            if (definition is null || version is null || !rulesByPackage.TryGetValue(packageId, out var rules))
            {
                state.UnknownProfiles[key] = source.Clone();
                continue;
            }

            if (!state.ProfileVersions.TryGetValue(key, out var storedVersion))
            {
                throw new InvalidOperationException($"The {version.Name} checklist profile is missing its data version.");
            }

            state.Profiles[key] = rules.Restore(versionId, storedVersion, version.ProgressVersion, source);
            if (storedVersion != version.ProgressVersion)
            {
                state.ProfileVersions[key] = version.ProgressVersion;
                changed = true;
            }
        }

        changed |= state.Normalize(catalog);
        return new RestoredLocalGuideState(state, changed);
    }

    public ChecklistProfileData ActiveProfile(GameCatalog catalog)
    {
        var key = ActiveProfileKey();
        if (!Profiles.TryGetValue(key, out var profile))
        {
            profile = new ChecklistProfileData();
            Profiles[key] = profile;
            var version = catalog.Games.First(game => game.Id == GameId).Versions.First(candidate => candidate.Id == Version);
            ProfileVersions[key] = version.ProgressVersion;
        }

        return profile;
    }

    public string ActiveProfileKey() => $"{GameId}:{Version}";

    public LocalGuideStateData Clone() => new()
    {
        GameId = GameId,
        Version = Version,
        Theme = Theme,
        AnimationsEnabled = AnimationsEnabled,
        DexMode = DexMode,
        Accent = Accent,
        SelectedVersions = new(SelectedVersions),
        SelectedDexModes = new(SelectedDexModes),
        Profiles = Profiles.ToDictionary(pair => pair.Key, pair => pair.Value.Clone()),
        UnknownProfiles = UnknownProfiles.ToDictionary(pair => pair.Key, pair => pair.Value.Clone()),
        ProfileVersions = new(ProfileVersions)
    };

    public string Serialize()
    {
        var profiles = UnknownProfiles.ToDictionary(pair => pair.Key, pair => pair.Value.Clone());
        foreach (var (key, profile) in Profiles)
        {
            profiles[key] = profile.Serialize();
        }

        return JsonSerializer.Serialize(new LocalGuideStateEnvelopeV1
        {
            FormatVersion = FormatVersion,
            GameId = GameId,
            Version = Version,
            Theme = Theme,
            AnimationsEnabled = AnimationsEnabled,
            DexMode = DexMode,
            Accent = Accent,
            SelectedVersions = SelectedVersions,
            SelectedDexModes = SelectedDexModes,
            Profiles = profiles,
            ProfileVersions = ProfileVersions
        }, JsonOptions);
    }

    private bool Normalize(GameCatalog catalog)
    {
        var changed = false;
        var game = catalog.Games.FirstOrDefault(candidate => candidate.Id == GameId)
            ?? catalog.Games.First(candidate => candidate.Id == catalog.DefaultGameId);
        if (GameId != game.Id)
        {
            GameId = game.Id;
            changed = true;
        }

        SelectedVersions ??= [];
        SelectedDexModes ??= [];
        var versionId = SelectedVersions.GetValueOrDefault(game.Id, Version);
        var version = game.Versions.FirstOrDefault(candidate => candidate.Id == versionId) ?? game.Versions[0];
        if (Version != version.Id || SelectedVersions.GetValueOrDefault(game.Id) != version.Id)
        {
            Version = version.Id;
            SelectedVersions[game.Id] = version.Id;
            changed = true;
        }

        var dexModeId = SelectedDexModes.GetValueOrDefault(game.Id, DexMode);
        var dexMode = game.DexModes.FirstOrDefault(candidate => candidate.Id == dexModeId) ?? game.DexModes[0];
        if (DexMode != dexMode.Id || SelectedDexModes.GetValueOrDefault(game.Id) != dexMode.Id)
        {
            DexMode = dexMode.Id;
            SelectedDexModes[game.Id] = dexMode.Id;
            changed = true;
        }

        if (Accent != version.Accent)
        {
            Accent = version.Accent;
            changed = true;
        }

        var key = ActiveProfileKey();
        if (!Profiles.ContainsKey(key))
        {
            Profiles[key] = new ChecklistProfileData();
            ProfileVersions[key] = version.ProgressVersion;
            changed = true;
        }

        return changed;
    }

}

internal sealed record RestoredLocalGuideState(LocalGuideStateData State, bool Changed);