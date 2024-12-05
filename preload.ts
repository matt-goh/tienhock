import { contextBridge, ipcRenderer } from 'electron';

declare global {
  interface Window {
    electron: {
      print: (options: any) => Promise<void>;
      getPrinters: () => Promise<any[]>;
    }
  }
}

contextBridge.exposeInMainWorld('electron', {
  print: (options: any) => ipcRenderer.invoke('print-pdf', options),
  getPrinters: () => ipcRenderer.invoke('get-printers')
});