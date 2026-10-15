"""Patch the prebuilt Android project so the release build is signed with our keystore.

Reads ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and
ANDROID_KEY_PASSWORD from the environment. If the keystore is not configured the project
is left alone and Expo's stock debug key signs the APK (fine for test builds).
"""
import os
import sys

gradle = sys.argv[1]
path = os.environ.get("ANDROID_KEYSTORE_PATH", "")
if not path or not os.path.exists(path):
    print("No release keystore configured: signing with the stock debug key.")
    sys.exit(0)

src = open(gradle).read()
config = """    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
"""
patched = src.replace("    signingConfigs {\n", config, 1)
release = patched.index("        release {\n            // Caution!")
patched = patched[:release] + patched[release:].replace(
    "signingConfig signingConfigs.debug", "signingConfig signingConfigs.release", 1
)
if patched == src or "signingConfigs.release" not in patched:
    sys.exit("android-signing.py: build.gradle layout changed, update this script")
open(gradle, "w").write(patched)
print("Release signing configured from the keystore secret.")
