// main.js
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { updateElectronApp } from 'update-electron-app';
import electronLog from 'electron-log';

// Configure auto-updates
updateElectronApp({
  logger: electronLog,
  updateInterval: '1 hour',
  notifyUser: true
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

// Connection retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Setup logging
const logFile = path.join(app.getPath('userData'), 'error.log');
function logMessage(message, error = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}${error ? '\nError: ' + error.stack : ''}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage);
}

function getAssetPath(...paths) {
  const RESOURCES_PATH = process.env.NODE_ENV === 'development'
    ? path.join(__dirname)
    : path.join(process.resourcesPath, 'app');
    
  logMessage(`Resources path: ${RESOURCES_PATH}`);
  return path.join(RESOURCES_PATH, ...paths);
}

const getServerUrl = () => {
  const isDev = process.env.NODE_ENV === 'development';
  const serverHost = process.env.SERVER_HOST || 'localhost';
  return isDev ? 'http://localhost:3000' : `http://${serverHost}:5000`;
};

// New function to handle connection retries
async function connectWithRetry(url, retries = MAX_RETRIES) {
  try {
    logMessage(`Attempting to connect to ${url} (${retries} retries remaining)`);
    await mainWindow.loadURL(url);
    logMessage('Connection successful');
  } catch (error) {
    logMessage(`Connection failed: ${error.message}`);
    
    if (retries > 0) {
      logMessage(`Retrying connection in ${RETRY_DELAY/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectWithRetry(url, retries - 1);
    }
    
    logMessage('Max retries reached, showing error to user');
    // Show error dialog to user
    mainWindow.webContents.executeJavaScript(`
      alert('Unable to connect to the server. Please check your network connection and server status.');
    `);
    throw error;
  }
}

// New function to handle file loading with retries
async function loadFileWithRetry(filePath, retries = MAX_RETRIES) {
  try {
    logMessage(`Attempting to load file ${filePath} (${retries} retries remaining)`);
    await mainWindow.loadFile(filePath);
    logMessage('File loaded successfully');
  } catch (error) {
    logMessage(`File load failed: ${error.message}`);
    
    if (retries > 0) {
      logMessage(`Retrying file load in ${RETRY_DELAY/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return loadFileWithRetry(filePath, retries - 1);
    }
    
    logMessage('Max retries reached, showing error to user');
    throw error;
  }
}

async function createWindow() {
  try {
    logMessage('Creating window...');
    
    mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      title: "Tien Hock ERP",
      icon: getAssetPath('build', 'tienhock.ico'),
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        additionalArguments: [`--server-url=${getServerUrl()}`]
      },
    });

    mainWindow.maximize();

    const isDev = process.env.NODE_ENV === 'development';
    logMessage(`Running in ${isDev ? 'development' : 'production'} mode`);

    if (isDev) {
      logMessage('Loading development URL');
      await connectWithRetry('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    } else {
      const indexPath = getAssetPath('build', 'index.html');
      logMessage(`Loading index.html from: ${indexPath}`);
      logMessage(`File exists: ${fs.existsSync(indexPath)}`);
      
      try {
        // List contents of directories to debug
        logMessage('Contents of resources directory:');
        if (process.resourcesPath) {
          logMessage(`${fs.readdirSync(process.resourcesPath).join(', ')}`);
        }
        
        const appPath = path.join(process.resourcesPath, 'app');
        if (fs.existsSync(appPath)) {
          logMessage('Contents of app directory:');
          logMessage(`${fs.readdirSync(appPath).join(', ')}`);
          
          const buildPath = path.join(appPath, 'build');
          if (fs.existsSync(buildPath)) {
            logMessage('Contents of build directory:');
            logMessage(`${fs.readdirSync(buildPath).join(', ')}`);
          }
        }
        
        await loadFileWithRetry(indexPath);
      } catch (loadError) {
        logMessage('Error loading index.html:', loadError);
        throw loadError;
      }
    }

    // Enhanced error handling for load failures
    mainWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription) => {
      logMessage(`Page failed to load: ${errorDescription} (${errorCode})`);
      
      // Attempt to reload on certain error codes
      if (errorCode === -6 || errorCode === -106) { // Common network-related error codes
        logMessage('Network-related error detected, attempting to reconnect...');
        const url = isDev ? 'http://localhost:3000' : getServerUrl();
        try {
          await connectWithRetry(url);
        } catch (retryError) {
          logMessage('Failed to reconnect after retries:', retryError);
        }
      }
    });

  } catch (error) {
    logMessage('Error in createWindow:', error);
    throw error;
  }
}

app.on('ready', () => {
  try {
    logMessage('App is ready');
    createWindow();
  } catch (error) {
    logMessage('Error during app ready:', error);
  }
});

process.on('uncaughtException', (error) => {
  logMessage('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  logMessage('Unhandled Rejection:', error);
});

app.on('window-all-closed', () => {
  logMessage('All windows closed');
  app.quit();
});