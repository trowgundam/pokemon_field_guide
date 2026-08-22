using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Schema;
using System.Text.Json.Serialization.Metadata;
using System.ComponentModel.DataAnnotations;
using PokemonFieldGuide.Shared.Contracts;

var check = args.SequenceEqual(["--check"]);
if (args.Length > (check ? 1 : 0))
{
    Console.Error.WriteLine("Usage: PokemonFieldGuide.SchemaGenerator [--check]");
    return 2;
}

var root = FindRepositoryRoot(Environment.CurrentDirectory);
var schemaDirectory = Path.Combine(root, "schemas");
var contracts = new Dictionary<string, Type>
{
    ["catalog.schema.json"] = typeof(GameCatalog),
    ["fieldguide.schema.json"] = typeof(FieldGuideData),
    ["pokedex.schema.json"] = typeof(List<PokedexEntry>),
    ["worlds.schema.json"] = typeof(List<GuideWorld>),
    ["package-manifest-v2.schema.json"] = typeof(PackageManifest),
    ["package-manifest-v3.schema.json"] = typeof(PackageManifestV3),
    ["local-guide-state-v1.schema.json"] = typeof(LocalGuideStateEnvelopeV1),
    ["checklist-profile-v1.schema.json"] = typeof(ChecklistProfileV1),
    ["checklist-profile-v2.schema.json"] = typeof(ChecklistProfileV2),
    ["portable-backup-v1.schema.json"] = typeof(PortableBackupV1),
    ["portable-backup-v2.schema.json"] = typeof(PortableBackupV2)
};
var jsonOptions = new JsonSerializerOptions(PokemonFieldGuideJson.Options)
{
    WriteIndented = true,
    TypeInfoResolver = new DefaultJsonTypeInfoResolver()
};
var exporterOptions = new JsonSchemaExporterOptions
{
    TreatNullObliviousAsNonNullable = true,
    TransformSchemaNode = (context, schema) =>
    {
        if (schema is JsonObject schemaObject
            && schemaObject["type"] is JsonValue type
            && type.TryGetValue<string>(out var typeName)
            && typeName == "object"
            && schemaObject["properties"] is JsonObject)
        {
            schema["additionalProperties"] = false;
        }
        var range = context.PropertyInfo?.AttributeProvider?
            .GetCustomAttributes(typeof(RangeAttribute), true)
            .OfType<RangeAttribute>()
            .SingleOrDefault();
        if (range is not null && schema is JsonObject ranged)
        {
            ranged["minimum"] = JsonValue.Create(range.Minimum);
            ranged["maximum"] = JsonValue.Create(range.Maximum);
        }
        var minimumLength = context.PropertyInfo?.AttributeProvider?
            .GetCustomAttributes(typeof(MinLengthAttribute), true)
            .OfType<MinLengthAttribute>()
            .SingleOrDefault();
        if (minimumLength is not null && schema is JsonObject stringSchema)
        {
            stringSchema["minLength"] = minimumLength.Length;
        }
        return schema;
    }
};

Directory.CreateDirectory(schemaDirectory);
var stale = new List<string>();
foreach (var (fileName, type) in contracts)
{
    var schema = JsonSchemaExporter.GetJsonSchemaAsNode(jsonOptions, type, exporterOptions).AsObject();
    ApplyContractConstants(fileName, schema);
    ApplyProfileDocumentSchemas(fileName, schema, jsonOptions, exporterOptions);
    schema.Insert(0, "$schema", "https://json-schema.org/draft/2020-12/schema");
    schema.Insert(1, "$id", $"https://pokemon-field-guide.local/schemas/{fileName}");
    var contents = schema.ToJsonString(jsonOptions) + Environment.NewLine;
    var path = Path.Combine(schemaDirectory, fileName);
    if (check)
    {
        if (!File.Exists(path) || File.ReadAllText(path) != contents) stale.Add(fileName);
    }
    else
    {
        File.WriteAllText(path, contents);
        Console.WriteLine($"Wrote {Path.GetRelativePath(root, path)}");
    }
}

if (stale.Count > 0)
{
    Console.Error.WriteLine($"Generated JSON Schemas are out of date: {string.Join(", ", stale)}");
    Console.Error.WriteLine("Run: just generate-schemas");
    return 1;
}
return 0;

static string FindRepositoryRoot(string start)
{
    for (var directory = new DirectoryInfo(start); directory is not null; directory = directory.Parent)
    {
        if (File.Exists(Path.Combine(directory.FullName, "global.json"))) return directory.FullName;
    }
    throw new InvalidOperationException("Could not find the repository root containing global.json.");
}

static void ApplyContractConstants(string fileName, JsonObject schema)
{
    if (schema["properties"] is not JsonObject properties) return;
    if (fileName is "package-manifest-v2.schema.json" or "portable-backup-v2.schema.json")
        properties["formatVersion"]!["const"] = 2;
    if (fileName is "package-manifest-v3.schema.json")
        properties["formatVersion"]!["const"] = 3;
    if (fileName is "local-guide-state-v1.schema.json" or "portable-backup-v1.schema.json")
        properties["formatVersion"]!["const"] = 1;
    if (fileName is "portable-backup-v1.schema.json" or "portable-backup-v2.schema.json")
        properties["format"]!["const"] = "pokemon-field-guide-backup";
}

static void ApplyProfileDocumentSchemas(
    string fileName,
    JsonObject schema,
    JsonSerializerOptions jsonOptions,
    JsonSchemaExporterOptions exporterOptions)
{
    JsonObject? profiles = fileName switch
    {
        "local-guide-state-v1.schema.json" => schema["properties"]?["profiles"] as JsonObject,
        "portable-backup-v1.schema.json" or "portable-backup-v2.schema.json" =>
            schema["properties"]?["games"]?["additionalProperties"]?["properties"]?["profiles"] as JsonObject,
        _ => null
    };
    if (profiles is null)
    {
        return;
    }

    profiles["additionalProperties"] = new JsonObject
    {
        ["anyOf"] = new JsonArray(
            JsonSchemaExporter.GetJsonSchemaAsNode(jsonOptions, typeof(ChecklistProfileV1), exporterOptions),
            JsonSchemaExporter.GetJsonSchemaAsNode(jsonOptions, typeof(ChecklistProfileV2), exporterOptions))
    };
}
