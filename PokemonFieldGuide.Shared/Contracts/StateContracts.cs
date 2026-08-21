using System.Text.Json;
using System.Text.Json.Serialization;

namespace PokemonFieldGuide.Shared.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ChecklistProfileV1
{
    public HashSet<string>? Caught { get; init; }
    public HashSet<string>? Collected { get; init; }
    public HashSet<string>? CompletedSpecial { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ChecklistProfileV2
{
    public HashSet<string>? Caught { get; init; }
    public HashSet<string>? Collected { get; init; }
    public List<CompletedSpecialV2>? CompletedSpecial { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CompletedSpecialV2(string Id, string? SpeciesId);

[JsonConverter(typeof(ChecklistProfileDocumentConverter))]
public sealed class ChecklistProfileDocument
{
    private ChecklistProfileDocument(
        ChecklistProfileV1? version1,
        ChecklistProfileV2? version2,
        string? unrecognizedJson)
    {
        Version1 = version1;
        Version2 = version2;
        UnrecognizedJson = unrecognizedJson;
    }

    public ChecklistProfileV1? Version1 { get; }
    public ChecklistProfileV2? Version2 { get; }
    internal string? UnrecognizedJson { get; }

    public static ChecklistProfileDocument FromVersion1(ChecklistProfileV1 profile) => new(profile, null, null);
    public static ChecklistProfileDocument FromVersion2(ChecklistProfileV2 profile) => new(null, profile, null);
    internal static ChecklistProfileDocument Unrecognized(string json) => new(null, null, json);

    public ChecklistProfileV1 RequireVersion1()
    {
        if (Version1 is not null)
        {
            return Version1;
        }
        if (Version2 is not null && (Version2.CompletedSpecial?.Count ?? 0) == 0)
        {
            return new ChecklistProfileV1
            {
                Caught = Version2.Caught,
                Collected = Version2.Collected,
                CompletedSpecial = []
            };
        }
        throw new JsonException("The checklist profile does not conform to profile format v1.");
    }

    public ChecklistProfileV2 RequireVersion2() => Version2
        ?? throw new JsonException("The checklist profile does not conform to profile format v2.");

    public ChecklistProfileDocument Clone() => Version1 is not null
        ? FromVersion1(Version1)
        : Version2 is not null
            ? FromVersion2(Version2)
            : Unrecognized(UnrecognizedJson!);
}

public sealed class ChecklistProfileDocumentConverter : JsonConverter<ChecklistProfileDocument>
{
    public override ChecklistProfileDocument Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        var root = document.RootElement;
        try
        {
            if (root.TryGetProperty("completedSpecial", out var completed)
                && completed.ValueKind == JsonValueKind.Array
                && completed.GetArrayLength() > 0
                && completed[0].ValueKind == JsonValueKind.String)
            {
                return ChecklistProfileDocument.FromVersion1(
                    root.Deserialize<ChecklistProfileV1>(options)
                    ?? throw new JsonException("The checklist profile is empty."));
            }

            return ChecklistProfileDocument.FromVersion2(
                root.Deserialize<ChecklistProfileV2>(options)
                ?? throw new JsonException("The checklist profile is empty."));
        }
        catch (JsonException)
        {
            return ChecklistProfileDocument.Unrecognized(root.GetRawText());
        }
    }

    public override void Write(
        Utf8JsonWriter writer,
        ChecklistProfileDocument value,
        JsonSerializerOptions options)
    {
        if (value.Version1 is not null)
        {
            JsonSerializer.Serialize(writer, value.Version1, options);
        }
        else if (value.Version2 is not null)
        {
            JsonSerializer.Serialize(writer, value.Version2, options);
        }
        else
        {
            writer.WriteRawValue(value.UnrecognizedJson!);
        }
    }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class LocalGuideStateEnvelopeV1
{
    [JsonRequired] public int FormatVersion { get; init; } = 1;
    public string? GameId { get; init; }
    public string? Version { get; init; }
    public string? Theme { get; init; }
    public bool AnimationsEnabled { get; init; } = true;
    public string? DexMode { get; init; }
    public string? Accent { get; init; }
    public Dictionary<string, string>? SelectedVersions { get; init; }
    public Dictionary<string, string>? SelectedDexModes { get; init; }
    public Dictionary<string, ChecklistProfileDocument>? Profiles { get; init; }
    public Dictionary<string, int>? ProfileVersions { get; init; }
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PortableBackupV1
{
    [JsonRequired] public string Format { get; init; } = "pokemon-field-guide-backup";
    [JsonRequired] public int FormatVersion { get; init; } = 1;
    [JsonRequired] public Dictionary<string, PortableBackupGameV1> Games { get; init; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PortableBackupGameV1
{
    public string? SelectedVersion { get; init; }
    public string? SelectedDexMode { get; init; }
    [JsonRequired] public Dictionary<string, ChecklistProfileDocument> Profiles { get; init; } = [];
    [JsonRequired] public Dictionary<string, int> ProfileVersions { get; init; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PortableBackupV2
{
    [JsonRequired] public string Format { get; init; } = "pokemon-field-guide-backup";
    [JsonRequired] public int FormatVersion { get; init; } = 2;
    [JsonRequired] public Dictionary<string, PortableBackupGameV2> Games { get; init; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class PortableBackupGameV2
{
    [JsonRequired] public Dictionary<string, ChecklistProfileDocument> Profiles { get; init; } = [];
    [JsonRequired] public Dictionary<string, int> ProfileVersions { get; init; } = [];
}