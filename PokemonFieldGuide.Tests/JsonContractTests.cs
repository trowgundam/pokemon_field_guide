using System.Text.Json;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class JsonContractTests
{
    [Fact]
    public void State_contracts_do_not_expose_untyped_json_values()
    {
        Type[] contractTypes =
        [
            typeof(LocalGuideStateEnvelopeV1),
            typeof(PortableBackupGameV1),
            typeof(PortableBackupGameV2)
        ];

        Assert.DoesNotContain(contractTypes.SelectMany(type => type.GetProperties()), property =>
            property.PropertyType == typeof(JsonElement)
            || property.PropertyType.GenericTypeArguments.Contains(typeof(JsonElement)));
    }

    [Fact]
    public void Encounter_types_use_stable_string_values()
    {
        var json = JsonSerializer.Serialize(EncounterType.OldRod, PokemonFieldGuideJson.Options);

        Assert.Equal("\"OldRod\"", json);
        Assert.Equal(EncounterType.OldRod,
            JsonSerializer.Deserialize<EncounterType>(json, PokemonFieldGuideJson.Options));
    }

    [Theory]
    [InlineData("999")]
    [InlineData("\"Unknown\"")]
    public void Encounter_types_reject_unsupported_json_values(string json)
    {
        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<EncounterType>(json, PokemonFieldGuideJson.Options));
    }
}