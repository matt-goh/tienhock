// main.js
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// Setup logging
const logFile = path.join(app.getPath('userData'), 'error.log');
function log(message, error = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}${error ? '\nError: ' + error.stack : ''}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage);
}

function getAssetPath(...paths) {
  const RESOURCES_PATH = process.env.NODE_ENV === 'development'
    ? path.join(__dirname)
    : path.join(process.resourcesPath, 'app');
    
  log(`Resources path: ${RESOURCES_PATH}`);
  return path.join(RESOURCES_PATH, ...paths);
}

async function createWindow() {
  try {
    log('Creating window...');
    
    mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      title: "Tien Hock ERP",
      icon: getAssetPath('build', 'tienhock.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
    });

    mainWindow.maximize();

    const isDev = process.env.NODE_ENV === 'development';
    log(`Running in ${isDev ? 'development' : 'production'} mode`);

    if (isDev) {
      log('Loading development URL');
      await mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      const indexPath = getAssetPath('build', 'index.html');
      log(`Loading index.html from: ${indexPath}`);
      log(`File exists: ${fs.existsSync(indexPath)}`);
      
      try {
        // List contents of directories to debug
        log('Contents of resources directory:');
        if (process.resourcesPath) {
          log(`${fs.readdirSync(process.resourcesPath).join(', ')}`);
        }
        
        const appPath = path.join(process.resourcesPath, 'app');
        if (fs.existsSync(appPath)) {
          log('Contents of app directory:');
          log(`${fs.readdirSync(appPath).join(', ')}`);
          
          const buildPath = path.join(appPath, 'build');
          if (fs.existsSync(buildPath)) {
            log('Contents of build directory:');
            log(`${fs.readdirSync(buildPath).join(', ')}`);
          }
        }
        
        await mainWindow.loadFile(indexPath);
      } catch (loadError) {
        log('Error loading index.html:', loadError);
        throw loadError;
      }
    }

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      log(`Page failed to load: ${errorDescription} (${errorCode})`);
    });

  } catch (error) {
    log('Error in createWindow:', error);
    throw error;
  }
}

app.on('ready', () => {
  try {
    log('App is ready');
    createWindow();
  } catch (error) {
    log('Error during app ready:', error);
  }
});

process.on('uncaughtException', (error) => {
  log('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  log('Unhandled Rejection:', error);
});

app.on('window-all-closed', () => {
  log('All windows closed');
  app.quit();
});