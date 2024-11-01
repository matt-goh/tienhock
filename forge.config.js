import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve absolute paths to icons
const ICON_PATH = path.resolve(__dirname, 'public', 'tienhock.ico');

export default {
  packagerConfig: {
    name: "tienhockerp",
    executableName: "tienhockerp",
    icon: ICON_PATH,
    asar: true,
    win32metadata: {
      "file-version": "1.0.0",
      "product-version": "1.0.0",
      "CompanyName": "Tien Hock",
      "FileDescription": "Tien Hock ERP",
      "InternalName": "tienhockerp",
      "OriginalFilename": "tienhockerp.exe",
      "ProductName": "Tien Hock ERP"
    },
    extraResource: [
      {
        "from": ".env",
        "to": ".env"
      }
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: "tienhockerp",
        authors: "Tien Hock",
        exe: "tienhockerp.exe",
        setupExe: "tienhockerp-setup.exe",
        setupIcon: ICON_PATH,
        iconUrl: ICON_PATH,
        noMsi: true
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32']
    }
  ]
};