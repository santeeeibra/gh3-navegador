using System.Security.Cryptography;
using System.Text.Json;
using System.Reflection;
using System.Text.RegularExpressions;
using NeversoftMultitool.Core.Formats.Texture;
using NeversoftMultitool.Core.Formats.Texture.NextGen;

// Thin local runner around unmodified MIT-licensed NeversoftMultitool readers.
// Source inputs are opened read-only. Outputs must be outside the input folder.
if (args.Length != 2) throw new ArgumentException("Usage: Extract <IMG folder> <output folder>");
var input = Path.GetFullPath(args[0]);
var output = Path.GetFullPath(args[1]);
if (output.Equals(input, StringComparison.OrdinalIgnoreCase) ||
    output.StartsWith(input + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
    throw new ArgumentException("Output must be outside the original input folder");
Directory.CreateDirectory(output);
var rows = new List<object>();
foreach (var file in Directory.GetFiles(input).Where(p => p.EndsWith(".img.xen") || p.EndsWith(".tex.xen")).Order()) {
    var bytes = File.ReadAllBytes(file);
    var result = file.EndsWith(".img.xen") ? XenImgFile.Parse(bytes) : NextGenTexFile.Parse(bytes);
    var hash = Convert.ToHexString(SHA256.HashData(bytes));
    if (!result.Success) {
        rows.Add(new { source=file, sha256=hash, success=false, error=result.ErrorMessage });
        Console.WriteLine($"FAIL {Path.GetFileName(file)}: {result.ErrorMessage}");
        // Upstream validates records in order before rejecting the whole file.
        // Recover ONLY the already validated prefix, leaving the failed record
        // and everything after it explicitly unconverted in the failure row.
        var match = Regex.Match(result.ErrorMessage ?? "", @"^Texture record (\d+) uses unsupported format");
        if (!file.EndsWith(".tex.xen") || !match.Success) continue;
        var prefixCount = int.Parse(match.Groups[1].Value);
        var reader = typeof(NextGenTexFile);
        var privateStatic = BindingFlags.Static | BindingFlags.NonPublic;
        object?[] headerArgs = [bytes, null, null];
        if (!(bool)reader.GetMethod("TryReadHeader", privateStatic)!.Invoke(null, headerArgs)!) continue;
        var recovered = new List<Ps2Texture>();
        for (var index=0; index<prefixCount; index++) {
            var tex = (Ps2Texture)reader.GetMethod("ReadTexture", privateStatic)!
                .Invoke(null, [bytes, headerArgs[1], index, null])!;
            if (tex.Pixels is null) throw new InvalidDataException("Validated prefix has no pixels");
            recovered.Add(tex);
        }
        result = new Ps2TexResult(recovered);
        Console.WriteLine($"PARTIAL: {prefixCount} validated records recovered; remainder not converted");
    }
    var textureIndex = 0;
    foreach (var texture in result.Textures) {
        var suffix = file.EndsWith(".tex.xen") ? $"_{textureIndex++:D3}_{texture.Checksum:X8}" : "";
        var dest = Path.Combine(output, Path.GetFileName(file) + suffix + ".rgba");
        File.WriteAllBytes(dest, texture.Pixels!);
        rows.Add(new { source=file, sha256=hash, success=true, width=texture.Width,
            height=texture.Height, format=texture.Psm, rgba=dest,
            rgbaSha256=Convert.ToHexString(SHA256.HashData(texture.Pixels!)) });
        Console.WriteLine($"OK {Path.GetFileName(file)} {texture.Width}x{texture.Height}");
    }
    if (!bytes.SequenceEqual(File.ReadAllBytes(file))) throw new IOException("Source changed during extraction");
}
File.WriteAllText(Path.Combine(output,"manifest.json"), JsonSerializer.Serialize(rows,new JsonSerializerOptions{WriteIndented=true}));
