import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

// Load environment variables first, before any isDev check
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

// Now check for development environment
const isDev = process.env.NODE_ENV === 'development' || process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath);
console.log('Development mode:', isDev);
console.log('Current directory:', __dirname);
console.log('Environment:', process.env.NODE_ENV);

function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  console.log('Starting server from:', serverPath);
  
  // Load environment variables
  const envPath = path.join(__dirname, '.env');
  const envConfig = dotenv.config({ path: envPath }).parsed || {};
  
  try {
    serverProcess = spawn('node', [serverPath], {
      stdio: 'inherit',
      windowsHide: true,
      detached: false,
      env: {
        ...process.env,
        ...envConfig,
        PORT: process.env.PORT || '5000',
        NODE_ENV: isDev ? 'development' : 'production',
        DB_HOST: isDev ? 'localhost' : process.env.DB_HOST,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        DB_PORT: process.env.DB_PORT
      }
    });

    // Add error handling
    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
    });

    if (isDev) {
      serverProcess.stdout?.on('data', (data) => {
        console.log(`Server stdout: ${data}`);
      });

      serverProcess.stderr?.on('data', (data) => {
        console.error(`Server stderr: ${data}`);
      });
    }

    return new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    throw error;
  }
}

async function createWindow() {
  try {
    await startServer();

    mainWindow = new BrowserWindow({
      width: 1600,
      height: 1200,
      title: "Tien Hock ERP",
      icon: path.join(__dirname, 'public', 'tienhock.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    mainWindow.maximize();

    if (isDev) {
      console.log('Loading development URL');
      await mainWindow.loadURL('http://localhost:3000');
    } else {
      const indexPath = path.join(__dirname, 'build', 'index.html');
      console.log('Loading production build from:', indexPath);
      await mainWindow.loadFile(indexPath);
    }

  } catch (error) {
    console.error('Error creating window:', error);
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.on('exit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});