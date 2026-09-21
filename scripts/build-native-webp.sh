#!/usr/bin/env bash
# Maintainer task on Linux. Normal Windows/Android Studio builds use the committed binaries.
set -euo pipefail
: "${ONDA_NDK_ROOT:?Set ONDA_NDK_ROOT to Android NDK 28.2.13676358 (r28c)}"
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl --fail --location --output "$work/source.tar.gz" https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.6.0.tar.gz
printf '%s  %s\n' e4ab7009bf0629fd11982d4c2aa83964cf244cffba7347ecd39019a9e38c4564 "$work/source.tar.gz" | sha256sum --check -
tar -xzf "$work/source.tar.gz" -C "$work"
source_dir="$work/libwebp-1.6.0"
# Match the unversioned SONAMEs requested by the Termux-derived FFmpeg build.
find "$source_dir" -name Makefile.in -exec sed -i -E 's/-version-info [0-9:]+/-avoid-version/g' {} +
toolchain="$ONDA_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin"
for entry in 'x86_64:x86_64-linux-android' 'arm64-v8a:aarch64-linux-android'; do
  abi=${entry%%:*}
  target=${entry#*:}
  mkdir -p "$work/$abi"
  (
    cd "$work/$abi"
    export CC="$toolchain/${target}26-clang" AR="$toolchain/llvm-ar" RANLIB="$toolchain/llvm-ranlib" STRIP="$toolchain/llvm-strip"
    export CFLAGS="-O2 -fPIC -ffile-prefix-map=$source_dir=."
    export LDFLAGS='-Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384'
    "$source_dir/configure" --host="$target" --enable-shared --disable-static --disable-png --disable-jpeg --disable-tiff --disable-gif --disable-sdl --disable-gl --enable-libwebpmux --disable-libwebpdemux --disable-libwebpdecoder
    make -j4
    destination="$repo/android/app/src/main/jniLibs/$abi"
    mkdir -p "$destination"
    cp src/.libs/libwebp.so src/mux/.libs/libwebpmux.so sharpyuv/.libs/libsharpyuv.so "$destination/"
    "$STRIP" --strip-unneeded "$destination"/*.so
  )
done
cp "$source_dir/COPYING" "$repo/android/app/src/main/assets/licenses/libwebp.txt"
python3 - "$repo" <<'PY'
import pathlib,hashlib,json,sys
root=pathlib.Path(sys.argv[1])/'android'
p=root/'native-webp/manifest.json'
manifest=json.loads(p.read_text())
for path in manifest['libraries']:
    data=(root/path).read_bytes()
    manifest['libraries'][path]={'sha256':hashlib.sha256(data).hexdigest(),'size':len(data)}
p.write_text(json.dumps(manifest,indent=2)+'\n')
PY
node --test "$repo/tests/ffmpeg-native.test.mjs"
