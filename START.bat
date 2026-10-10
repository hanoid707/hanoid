@echo off
chcp 65001 >nul
title AI-SNS 실행기
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js가 설치되어 있지 않아요.
  echo      https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행하세요.
  start "" https://nodejs.org
  pause
  exit /b 1
)

rem 처음 실행이거나, 예전 폴더에 덮어써서 새 부품(사진 자르기)이 없으면 설치
set NEED_INSTALL=0
if not exist "node_modules\" set NEED_INSTALL=1
if not exist "node_modules\expo-image-manipulator\" set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
  echo.
  echo  필요한 파일을 설치해요. 몇 분 걸릴 수 있어요...
  call npm install
  if errorlevel 1 (
    echo  [!] 설치에 실패했어요. 인터넷 연결을 확인하고 다시 실행하세요.
    pause
    exit /b 1
  )
)

rem 새 버전을 처음 실행할 때는 이전 설정(DB 주소 등)이 남지 않게 캐시를 비우고 시작
set CLEAR=
if not exist ".expo\aisns-v31.flag" (
  set CLEAR=--clear
  if not exist ".expo\" mkdir ".expo"
  echo v31> ".expo\aisns-v31.flag"
)

echo.
echo  =========================================
echo    AI-SNS 실행 방법을 고르세요
echo  =========================================
echo    1. 폰에서 실행  (PC와 폰이 같은 와이파이)
echo    2. 폰에서 실행  (와이파이가 달라도 됨, 조금 느림)
echo    3. PC 브라우저에서 실행
echo.
echo    폰은 "Expo Go" 앱을 설치하고 화면에 뜨는 QR을 찍으세요.
echo    (안드로이드: Expo Go 앱으로 / 아이폰: 기본 카메라로)
echo.
choice /c 123 /n /m "  번호를 누르세요 [1/2/3]: "
if errorlevel 3 goto web
if errorlevel 2 goto tunnel

call npx expo start %CLEAR%
goto done

:tunnel
call npx expo start --tunnel %CLEAR%
goto done

:web
call npx expo start --web %CLEAR%

:done
pause
