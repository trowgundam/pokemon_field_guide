using System.Text.Json;

using Xunit;

namespace PokemonFieldGuide.Tests;

public sealed class InstalledJsonContractTests
{
    [Fact]
    public void Every_installed_game_package_deserializes_with_the_runtime_contracts()
    {
        var root = RepositoryRoot();
        var webRoot = Path.Combine(root, "PokemonFieldGuide", "wwwroot");
        var catalog = Deserialize<GameCatalog>(Path.Combine(webRoot, "games", "catalog.json"));

        foreach (var game in catalog.Games)
        {
            Deserialize<FieldGuideData>(Path.Combine(webRoot, game.DataPath));
            Deserialize<List<PokedexEntry>>(Path.Combine(webRoot, game.PokedexPath));
            Deserialize<List<GuideWorld>>(Path.Combine(webRoot, game.WorldsPath));
            var manifest = Deserialize<PackageManifest>(Path.Combine(
                Path.GetDirectoryName(Path.Combine(webRoot, game.DataPath))!,
                "package-manifest.json"));
            Assert.Equal(2, manifest.FormatVersion);
        }
    }

    [Fact]
    public void Frlg_owns_a_stable_unown_sprite()
    {
        var root = RepositoryRoot();
        var packageRoot = Path.Combine(root, "PokemonFieldGuide", "wwwroot", "games", "frlg");
        var manifest = Deserialize<PackageManifest>(Path.Combine(packageRoot, "data", "package-manifest.json"));

        Assert.Equal("unown.png", manifest.PokemonSprites["SPECIES_UNOWN"]);
        Assert.True(File.Exists(Path.Combine(packageRoot, "sprites", "pokemon", "unown.png")));
    }

    private static T Deserialize<T>(string path) =>
        JsonSerializer.Deserialize<T>(File.ReadAllText(path), PokemonFieldGuideJson.Options)
        ?? throw new InvalidOperationException($"{path} deserialized to null.");

    private static string RepositoryRoot()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            if (File.Exists(Path.Combine(directory.FullName, "global.json"))) return directory.FullName;
        }
        throw new InvalidOperationException("Could not find the repository root containing global.json.");
    }
}