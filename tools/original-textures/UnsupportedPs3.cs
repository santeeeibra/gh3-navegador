// The local runner calls only Parse(byte[]) for Xbox 360. It does not support
// the unused upstream AssetSource/PS3 twin overload. Fail explicitly if invoked.
namespace NeversoftMultitool.Core.Formats.Texture {
    public sealed class AssetSource { }
}
namespace NeversoftMultitool.Core.Formats.Texture.NextGen {
    public static class NextGenVramTwinLocator {
        public static byte[]? TryLoad(AssetSource source, byte[] data) =>
            throw new NotSupportedException("PS3 twin/AssetSource loading is outside this Xbox 360 runner");
    }
}
