@echo off
setlocal
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

echo  [1/3] Installing packages ... first run takes 3-5 minutes
if exist "node_modules\" (
  echo        already installed, skipping
) else (
  call npm install
  if errorlevel 1 goto failed
)

echo.
echo  [2/3] Building web bundle ...
echo        Gemini key is kept OUT of the bundle on purpose.
echo        GitHub blocks any push that contains a Google API key.
echo        Enter the key once inside the app - it then syncs to every device.
if exist "dist\" rmdir /s /q "dist"
copy /y ".env.local" ".env.keep" >nul
findstr /v /b "EXPO_PUBLIC_GEMINI_API_KEY=" ".env.keep" > ".env.local"
call npm run build:web
set BUILDERR=%errorlevel%
copy /y ".env.keep" ".env.local" >nul
del ".env.keep"
if not "%BUILDERR%"=="0" goto failed
if not exist "dist\index.html" goto failed

echo.
echo  [3/3] Pushing to GitHub Pages ...
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
echo   First time on each device:
echo     1. Me tab  -^>  AI connect   -^>  paste Gemini API key
echo     2. Me tab  -^>  Settings     -^>  DB sync  -^>  paste sync code
echo   After that the key is stored in your Supabase and comes down
echo   automatically on every other device. You never type it again.
echo.
start "" https://hanoid707.github.io/hanoid/
goto done

:failed
popd 2>nul
echo.
echo  [X] Build failed. Copy the red text above and send it back.

:done
echo.
pause
popd
endlocal
