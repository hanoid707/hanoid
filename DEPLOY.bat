@echo off
setlocal enabledelayedexpansion
title AI-SNS Deploy
pushd "%~dp0"

echo.
echo  ====================================
echo   AI-SNS : build and deploy
echo  ====================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js not found. Install LTS from https://nodejs.org then run again.
  start "" https://nodejs.org
  goto done
)
where git >nul 2>nul
if errorlevel 1 (
  echo  [X] Git not found. Install from https://git-scm.com/download/win then run again.
  start "" https://git-scm.com/download/win
  goto done
)
if not exist ".env.local" (
  echo  [X] .env.local is missing. Unzip the package again without removing files.
  goto done
)

echo  [1/4] Installing packages ... first run takes 3-5 minutes
if exist "node_modules\" (
  echo        already installed, skipping
) else (
  call npm install
  if errorlevel 1 goto failed
)

echo.
echo  [2/4] Building web bundle ^(cache cleared^) ...
echo        The Gemini key AND the sync code are kept OUT of the bundle.
echo        The site is public: anyone could read the sync code out of the
echo        JavaScript and use it to fetch the Gemini key from Supabase.

rem --- remember the real env file, then build without the two secrets
copy /y ".env.local" ".env.keep" >nul
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "EXPO_PUBLIC_GEMINI_API_KEY=" ".env.keep"`) do set "GKEY=%%b"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /b "EXPO_PUBLIC_AISNS_SYNC_KEY=" ".env.keep"`) do set "SKEY=%%b"
findstr /v /b "EXPO_PUBLIC_GEMINI_API_KEY= EXPO_PUBLIC_AISNS_SYNC_KEY=" ".env.keep" > ".env.local"

rem --- Metro caches inlined env values, so wipe every cache before building
if exist "dist\" rmdir /s /q "dist"
if exist ".expo\" rmdir /s /q ".expo"
if exist "node_modules\.cache\" rmdir /s /q "node_modules\.cache"

call npx expo export -p web --clear
set "BUILDERR=%errorlevel%"
copy /y ".env.keep" ".env.local" >nul
del ".env.keep"
if not "%BUILDERR%"=="0" goto failed
if not exist "dist\index.html" goto failed

echo.
echo  [3/4] Verifying the bundle has no secrets ...
if defined GKEY (
  findstr /m /s /c:"!GKEY!" "dist\*" >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo  [X] The Gemini key is STILL inside the bundle. Push would be rejected.
    echo      Stopping here instead of wasting a failed push.
    echo      Send this message back and it will be fixed.
    goto done
  )
)
if defined SKEY (
  findstr /m /s /c:"!SKEY!" "dist\*" >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo  [X] The sync code is STILL inside the bundle. Stopping.
    echo      Send this message back and it will be fixed.
    goto done
  )
)
echo        clean - no key, no sync code

echo.
echo  [4/4] Pushing to GitHub Pages ...
pushd "dist"
type nul > .nojekyll
copy /y index.html 404.html >nul
git init -q
git add -A
git -c user.name="hanoid707" -c user.email="hansy@daangn.com" commit -q -m "deploy"
git remote add origin https://github.com/hanoid707/hanoid.git
git push --force origin HEAD:gh-pages
if errorlevel 1 (
  popd
  echo.
  echo  [X] Push failed. Copy the WHOLE black window text and send it back.
  goto done
)
popd

echo.
echo  ====================================
echo   DONE
echo  ====================================
echo.
echo   Open:  https://hanoid707.github.io/hanoid/
echo.
echo   Once per device:
echo     1. Me tab  -^>  AI connect  -^>  paste the Gemini API key
echo     2. Me tab  -^>  Settings    -^>  DB sync  -^>  paste the sync code
echo   The key is then stored in your own Supabase and downloads itself
echo   on every other device. You only type it once.
echo.
start "" https://hanoid707.github.io/hanoid/
goto done

:failed
popd 2>nul
if exist ".env.keep" (
  copy /y ".env.keep" ".env.local" >nul
  del ".env.keep"
)
echo.
echo  [X] Build failed. Copy the red text above and send it back.

:done
echo.
pause
popd
endlocal
