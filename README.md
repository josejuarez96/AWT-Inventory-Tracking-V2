# AWT Inventory Tracker

Modern web-based perpetual inventory management system for **All World Trailers**.

## 🎯 Project Goal

Replace manual/mental tracking with a digital system to:
- Eliminate vendor payment holds
- Track costs accurately
- Provide real-time stock visibility across ADEL and CALHOUN locations

## 🛠️ Tech Stack

- **Frontend**: React (Vite) + TypeScript + Tailwind CSS + Shadcn/UI
- **Backend**: Node.js + Express
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT tokens + bcrypt

## 📋 Prerequisites

- **Node.js** 18+ and npm (Download from [nodejs.org](https://nodejs.org/))
- **PostgreSQL** 14+ (Choose one option below)

### PostgreSQL Setup Options

**Option 1: Local PostgreSQL** (Recommended for offline development)
- macOS: `brew install postgresql@14 && brew services start postgresql@14`
- Windows: Download from [postgresql.org](https://www.postgresql.org/download/)
- Create database: `createdb awt_inventory`

**Option 2: Prisma Dev** (Easiest - auto PostgreSQL)
- No manual install needed
- Run `npx prisma dev` in backend folder
- Copy generated DATABASE_URL to .env

**Option 3: Railway.app** (Cloud, requires internet)
- Sign up at [railway.app](https://railway.app)
- Create new PostgreSQL database
- Copy connection string to .env

## 🚀 Getting Started

### 1. Clone and Install

```bash
# Navigate to project directory
cd "AWT Inventory Tracking V2"

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### 2. Configure Database

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env and update DATABASE_URL with your PostgreSQL connection string
# Default: postgresql://postgres:postgres@localhost:5432/awt_inventory?schema=public
```

### 3. Run Database Migrations

```bash
cd backend

# Generate Prisma client and create database tables
npx prisma migrate dev --name init

# Seed database with test data
npm run prisma:seed
```

**Test Accounts Created:**
- Admin: `username=jose`, `password=password123`
- User: `username=alix`, `password=password123`

### 4. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```
Backend runs on: http://localhost:3000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on: http://localhost:5173

### 5. Verify Setup

1. Open browser to http://localhost:5173
2. Backend health check: http://localhost:3000/api/health
3. Should see: `{"status":"ok","message":"AWT Inventory Tracker API is running"}`

## 📊 Test Data

The seed script populates the database with:
- **2 Users**: Admin (Jose) and Standard User (Alix)
- **4 Vendors**: Dexter, Lippert, ACME, Titan
- **8 Items**: Axles, brakes, lights, fasteners, couplers
- **7 Transactions**: Opening balances, receipts, transfers, adjustments

All data is across both ADEL and CALHOUN locations.

## 🗂️ Project Structure

```
AWT Inventory Tracking V2/
├── frontend/              # React + Vite frontend
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── backend/               # Express API server
│   ├── src/
│   │   └── index.js      # Main server file
│   ├── prisma/
│   │   ├── schema.prisma # Database schema
│   │   └── seed.js       # Test data seed script
│   ├── .env              # Environment variables (not in git)
│   └── package.json
├── docs/                  # Documentation
├── PROJECT_PLAN.md       # Development roadmap
└── README.md             # This file
```

## 🎯 Current Phase: Phase 0 - Project Bootstrap

**Status**: ✅ Complete

**Next Steps**: Phase 1 - Foundation (Authentication, Dashboard, User Management)

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for full roadmap.

## 🔧 Common Commands

### Backend
```bash
npm run dev              # Start development server with nodemon
npm start                # Start production server
npm run prisma:migrate   # Run database migrations
npm run prisma:seed      # Seed database with test data
```

### Frontend
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build
```

### Prisma
```bash
npx prisma studio        # Open database GUI (great for viewing data)
npx prisma generate      # Regenerate Prisma client
npx prisma migrate dev   # Create and apply migration
```

## 🐛 Troubleshooting

### "Can't connect to database"
- Check PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in backend/.env
- Test connection: `npx prisma db push`

### "Module not found" errors
- Run `npm install` in both frontend/ and backend/
- Delete node_modules and run `npm install` again

### "Port already in use"
- Backend: Change PORT in backend/.env
- Frontend: Vite will auto-assign new port

### Seed script fails
- Drop and recreate database: `dropdb awt_inventory && createdb awt_inventory`
- Run migrations first: `npx prisma migrate dev`
- Then seed: `npm run prisma:seed`

## 📖 Documentation

- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Full development roadmap and timeline
- [Prisma Docs](https://www.prisma.io/docs) - Database ORM documentation
- [Vite Docs](https://vitejs.dev) - Frontend build tool
- [Express Docs](https://expressjs.com) - Backend framework

## 🎯 Next Phase: Foundation

Once Phase 0 is complete, Phase 1 will implement:
- JWT authentication system
- Login/logout functionality
- Responsive sidebar navigation
- Dashboard with summary widgets
- User management (admin only)

Estimated time: 20-30 hours

---

**Built for All World Trailers | Local Development | PostgreSQL Database**
