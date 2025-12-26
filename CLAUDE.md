# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules
1. Implement only what is explicitly requested, Always ask permission before modifying components not specifically mentioned.
2. Write clean code and use best practice.
3. Break down large tasks and ask clarifying questions when needed.
4. Try your best to code your designs in clean and good-looking manner, but still professional, and then adjust the layouts to be symmetrical.
5. Always add appropriate types to all function parameters, variables, and return types.
6. Fix all TypeScript errors immediately - don't leave them for the user to fix.
7. Identify potential edge cases or limitations in your implementation.
8. Don't run or ask to run npm run build, type checks or lint commands unless explicitly requested by the user. The user will do the tests manually.

## Architecture Overview

### Multi-Company ERP System
This is a comprehensive ERP system supporting three companies:
- **Tien Hock** (main/default company) - routes without prefix
- **Green Target** - routes prefixed with `/greentarget`
- **Jelly Polly** - routes prefixed with `/jellypolly`

### Frontend Architecture (React + TypeScript)
- **Main App**: `src/App.tsx` - Handles routing, authentication, and layout
- **Routing**: `src/pages/pagesRoute.tsx` - Dynamically generates routes for all companies
- **Contexts**: 
  - `AuthContext.tsx` - User authentication state
  - `CompanyContext.tsx` - Multi-company switching logic
- **Company-specific Sidebar Data**:
  - `TienHockSidebarData.tsx`
  - `GreenTargetSidebarData.tsx` 
  - `JellyPollySidebarData.tsx`

### Backend Architecture (Node.js + Express)
- **Main Server**: `server.js` - Express app with PostgreSQL pool, CORS, scheduled jobs
- **Database**: PostgreSQL with enhanced connection pooling (`src/routes/utils/db-pool.js`)
- **Route Organization**: `src/routes/index.js` sets up all API routes
- **Company-specific Routes**: Each company has separate route handlers under their respective directories

### Key Features
- **E-Invoice Integration**: Malaysia MyInvois system integration for all companies
- **PDF Generation**: Invoice, payslip, and report generation using `@react-pdf/renderer`
- **Payroll System**: Comprehensive payroll processing with EPF, SOCSO, income tax calculations
- **Multi-user Support**: Session-based authentication with real-time data synchronization
- **Scheduled Jobs**: Daily invoice status updates and auto-consolidation via node-cron
- **Mobile Warning**: Desktop-optimized UI with mobile device detection

### Database
- PostgreSQL with connection pooling
- Maintenance mode support for database operations
- Environment variables for database configuration

### Styling
- Tailwind CSS with custom color palette
- Segoe UI font family
- Responsive design with desktop optimization

### File Structure Patterns
- **Pages**: Organized by company and functionality in `src/pages/`
- **Components**: Reusable components in `src/components/` with feature-specific subdirectories
- **Utils**: Business logic utilities in `src/utils/` organized by feature
- **Routes**: Backend API routes in `src/routes/` mirroring frontend page structure
- **Types**: TypeScript definitions in `src/types/types.ts`

### Development Setup
The project uses a hybrid setup: Docker for the database, native Node.js for the server and Vite for the frontend.

**Prerequisites:**
- Node.js (via NVM recommended)
- Docker Desktop

**Starting Development:**
```bash
# First time only - install dependencies
npm install --legacy-peer-deps

# Start development environment
dev.bat
```

This starts:
- **PostgreSQL** in Docker (port 5434)
- **API Server** with nodemon (port 5000) - auto-restarts on backend changes
- **Vite Frontend** (port 3000) - fast HMR for frontend changes

**Useful Commands:**
- `Ctrl+C` - Stop all services
- Type `rs` + Enter - Restart API server only
- `cd dev && docker compose down` - Stop database

**Environment Variables:**
- Development: `.env` file in project root
- Production: Server environment variables (not from .env)

### Production Setup
- Frontend built with `npm run build` (outputs to `build/` directory)
- Server runs with `npm run server-prod` (node server.js directly)
- Database connection via production environment variables
- CORS configured for production domain