// src/components/SafeLink.tsx
import React from "react";
import { Link, LinkProps } from "react-router-dom";

interface SafeLinkProps extends Omit<LinkProps, "to"> {
  to: string;
  hasUnsavedChanges: boolean;
  onNavigateAttempt: (to: string) => void;
}

const SafeLink: React.FC<SafeLinkProps> = ({
  to,
  hasUnsavedChanges,
  onNavigateAttempt,
  onClick,
  children,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      onNavigateAttempt(to);
    }

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <Link to={to} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
};

export default SafeLink;
