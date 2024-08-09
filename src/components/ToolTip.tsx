import React from "react";

type ToolTipProps = {
  children: React.ReactNode;
  content: string;
  position?: "top" | "bottom";
  visible?: boolean;
};

const ToolTip = ({
  children,
  content,
  position = "top",
  visible = true,
}: ToolTipProps) => {
  const tooltipClass =
    position === "bottom"
      ? "top-full translate-y-1.5"
      : "bottom-full -translate-y-1.5";

  const renderContent = (text: string) => {
    const words = text.split(/(\s+)/);
    return words.map((word, index) => {
      if (word === "Klik" || word === "Seret") {
        return (
          <span key={index} className="font-bold text-gray-500">
            {word}
          </span>
        );
      }
      return <span key={index}>{word}</span>;
    });
  };
  return (
    <div className="relative inline-block">
      <div>{children}</div>
      {visible && (
        <div
          className={`absolute z-10 px-3 py-2 w-auto font-semibold text-xs text-gray-500/80 text-center bg-gray-200 rounded-lg shadow-sm left-1/2 transform -translate-x-1/2 whitespace-pre-wrap ${tooltipClass}`}
        >
          {renderContent(content)}
        </div>
      )}
    </div>
  );
};

export default ToolTip;
