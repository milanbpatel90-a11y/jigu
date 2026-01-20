@echo off
echo ========================================
echo   Deploying Dashboard to Vercel
echo ========================================
echo.
echo This deploys the Dashboard (AI Finder + Saved Models)
echo NOT the Try-On app
echo.

cd frontend

echo Installing dependencies...
call npm install

echo.
echo Building production version...
call npm run build

echo.
echo Deploying to Vercel...
call vercel --prod

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo Your app is now live on Vercel.
echo Check the URL above to access it.
echo.
pause
