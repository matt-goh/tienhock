interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  hideText?: boolean;
}

const LoadingSpinner = ({
  size = "md",
  hideText = false,
}: LoadingSpinnerProps) => {
  const spinnerSizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${spinnerSizes[size]} border-4 border-gray-100 border-t-sky-500 rounded-full animate-spin`}
      />
      {!hideText && (
        <div className="text-sky-500 text-sm font-medium">Loading...</div>
      )}
    </div>
  );
};

export default LoadingSpinner;
