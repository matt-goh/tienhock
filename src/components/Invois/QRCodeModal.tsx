import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { IconX } from '@tabler/icons-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

const QRCodeModal = ({ isOpen, onClose, url }: QRCodeModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center">
        {/* Overlay */}
        <div 
          className="fixed inset-0 bg-black/30 transition-opacity" 
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative transform overflow-hidden rounded-lg bg-white p-6 text-left shadow-xl transition-all w-full max-w-sm">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-default-400 hover:text-default-500"
          >
            <IconX size={20} />
          </button>

          {/* Content */}
          <div className="mt-2">
            <h3 className="text-lg font-medium leading-6 text-default-900 mb-4">
              Scan QR Code
            </h3>
            <div className="flex justify-center bg-white p-4 rounded-lg">
              <QRCodeSVG 
                value={url}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="mt-4 text-sm text-default-500 text-center">
              Scan this QR code to view the e-invoice
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;