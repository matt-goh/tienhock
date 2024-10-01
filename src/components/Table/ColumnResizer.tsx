import React, { useState } from "react";

interface ColumnResizerProps {
  onResize: (width: number) => void;
  initialWidth: number;
}

const ColumnResizer: React.FC<ColumnResizerProps> = ({
  onResize,
  initialWidth,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(initialWidth);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    setStartX(e.clientX);
    setStartWidth(initialWidth);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Minimum width of 50px
    onResize(newWidth);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent z-10"
      style={{
        transform: "translateX(50%)",
        transition: "background-color 0.2s ease",
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
};

export default ColumnResizer;
