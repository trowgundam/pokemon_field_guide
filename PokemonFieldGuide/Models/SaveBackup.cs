namespace PokemonFieldGuide.Models;

public sealed class SaveBackup
{
    public const string CurrentFormat = "pokemon-field-guide-backup";
    public const int CurrentVersion = 1;

    public string Format { get; set; } = CurrentFormat;
    public int FormatVersion { get; set; } = CurrentVersion;
    public DateTimeOffset ExportedAt { get; set; } = DateTimeOffset.UtcNow;
    public Dictionary<string, GameSaveBackup> Games { get; set; } = [];
}

public sealed class GameSaveBackup
{
    public string SelectedVersion { get; set; } = "";
    public string SelectedDexMode { get; set; } = "";
    public Dictionary<string, VersionProgress> Profiles { get; set; } = [];
    public Dictionary<string, int> ProfileVersions { get; set; } = [];
}
