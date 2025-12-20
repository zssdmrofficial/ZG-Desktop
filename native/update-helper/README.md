# ZG Update Helper

Build the background updater and copy it into `resources/update-helper/` so Electron can bundle it.

## Build (Visual Studio / MSVC)

```powershell
cmake -S native/update-helper -B native/update-helper/build -G "Visual Studio 17 2022" -A x64
cmake --build native/update-helper/build --config Release
```

The output binary is `resources/update-helper/ZG-UpdateHelper.exe`.
