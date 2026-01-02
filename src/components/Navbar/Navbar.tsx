// src/components/Navbar/Navbar.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconMenu2 } from "@tabler/icons-react";
import { useCompany } from "../../contexts/CompanyContext";
import { useBookmarks } from "../../hooks/useBookmarks";
import TienHockLogo from "../../utils/TienHockLogo";
import GreenTargetLogo from "../../utils/GreenTargetLogo";
import NavbarMenu from "./NavbarMenu";
import NavbarBookmarks from "./NavbarBookmarks";
import NavbarUserMenu from "./NavbarUserMenu";
import NavbarMobileMenu from "./NavbarMobileMenu";
import CompanySwitcher from "../CompanySwitcher";

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const {
    bookmarks,
    bookmarkedItems,
    shouldShowBookmarks,
    handleBookmarkUpdate,
    findNavItem,
    navData,
  } = useBookmarks();

  const getCompanyLogo = () => {
    switch (activeCompany.id) {
      case "greentarget":
        return <GreenTargetLogo width={32} height={32} />;
      default:
        return <TienHockLogo width={32} height={32} />;
    }
  };

  const handleLogoClick = () => {
    const homePath = activeCompany.routePrefix
      ? `/${activeCompany.routePrefix}`
      : "/";
    navigate(homePath);
  };

  return (
    <>
      <header className="flex-shrink-0 z-50 h-16 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-default-200 dark:border-gray-700 shadow-sm">
        <div className="h-full max-w-[1920px] mx-auto px-4 flex items-center justify-between">
          {/* Left Section: Mobile Menu Button + Logo + Company */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Open menu"
            >
              <IconMenu2 size={24} className="text-default-700 dark:text-gray-200" />
            </button>

            {/* Company Switcher (Desktop) */}
            <div className="hidden lg:block">
              <CompanySwitcher />
            </div>
          </div>

          {/* Center Section: Navigation Menu (Desktop only) */}
          <div className="hidden lg:flex flex-1 justify-center">
            <NavbarMenu
              items={navData}
              bookmarkedItems={bookmarkedItems}
              onBookmarkUpdate={handleBookmarkUpdate}
              showBookmarkIcon={shouldShowBookmarks}
            />
          </div>

          {/* Right Section: Bookmarks + User Menu */}
          <div className="flex items-center gap-2">
            {/* Bookmarks (Desktop, Tien Hock only) */}
            {shouldShowBookmarks && (
              <div className="hidden sm:block">
                <NavbarBookmarks
                  bookmarks={bookmarks}
                  bookmarkedItems={bookmarkedItems}
                  onBookmarkUpdate={handleBookmarkUpdate}
                  findNavItem={findNavItem}
                  navData={navData}
                />
              </div>
            )}

            {/* User Menu */}
            <NavbarUserMenu />
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <NavbarMobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navData={navData}
        bookmarks={bookmarks}
        bookmarkedItems={bookmarkedItems}
        onBookmarkUpdate={handleBookmarkUpdate}
        findNavItem={findNavItem}
        shouldShowBookmarks={shouldShowBookmarks}
      />
    </>
  );
}
