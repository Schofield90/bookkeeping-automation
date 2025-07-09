# Bookkeeping Automation

A full-stack bookkeeping automation application built with Next.js, TypeScript, and Node.js. This application automates the process of categorizing bank transactions using AI and integrates with Xero for accounting management.

## Features

- **Bank Statement Upload**: Support for CSV and PDF bank statement uploads
- **AI-Powered Categorization**: Uses Anthropic Claude API to automatically categorize transactions
- **Xero Integration**: OAuth2 authentication and automatic transaction posting to Xero
- **Telegram Integration**: Bot integration for handling uncertain transactions requiring clarification
- **Admin Dashboard**: Real-time overview of transaction processing status
- **Automated Processing**: Cron jobs for background transaction processing
- **Secure Authentication**: Session-based authentication with encrypted sessions

## Tech Stack

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Backend**: Next.js API Routes with Node.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Iron Session for secure session management
- **AI**: Anthropic Claude API for transaction categorization
- **Integrations**: Xero API, Telegram Bot API
- **Deployment**: Vercel with automated deployments
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js 18+ 
- PostgreSQL database (or Supabase)
- Anthropic API key
- Xero developer account
- Telegram bot token (optional)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bookkeeping-automation
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your `.env.local` with the required values:
```env
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Anthropic Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key

# Xero API
XERO_CLIENT_ID=your-xero-client-id
XERO_CLIENT_SECRET=your-xero-client-secret
XERO_REDIRECT_URI=http://localhost:3000/api/auth/xero/callback

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Session encryption
SESSION_PASSWORD=complex-password-at-least-32-characters-long

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=hashed-password-here
```

5. Set up the database:
```bash
npm run db:migrate:dev
npm run db:seed
```

6. Run the development server:
```bash
npm run dev
```

## Usage

### 1. Authentication
- Navigate to `/login` and use your admin credentials
- Default username: `admin` (configurable via environment variables)

### 2. Xero Setup
- Go to "Xero Settings" from the dashboard
- Click "Connect to Xero" to authenticate with your Xero account
- Grant the necessary permissions for accounting transactions

### 3. Upload Bank Statements
- Navigate to the "Upload Statement" page
- Upload CSV or PDF bank statements
- The system will automatically parse and extract transaction data

### 4. AI Categorization
- Transactions are automatically categorized using Claude AI
- High-confidence transactions are marked as "CATEGORIZED"
- Low-confidence transactions trigger Telegram notifications (if configured)

### 5. Telegram Clarification (Optional)
- Set up a Telegram bot and configure the webhook
- When uncertain transactions are found, you'll receive Telegram messages
- Reply to clarify the correct category
- Transactions will be updated based on your responses

### 6. Automatic Processing
- Categorized transactions are automatically posted to Xero via cron jobs
- Monitor processing status in the admin dashboard
- Failed transactions are retried automatically

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### File Upload
- `POST /api/upload` - Upload bank statements

### Xero Integration
- `GET /api/auth/xero` - Initiate Xero OAuth
- `GET /api/auth/xero/callback` - Handle OAuth callback
- `POST /api/transactions/[id]/post-to-xero` - Manually post transaction

### Telegram
- `POST /api/webhooks/telegram` - Telegram webhook handler

### Cron Jobs
- `GET /api/cron/process-pending` - Process pending transactions

## Database Schema

The application uses the following main models:

- **User**: Admin user authentication
- **Upload**: Bank statement upload records
- **Transaction**: Individual transaction records with AI categorization
- **XeroToken**: Xero OAuth tokens for API access
- **TelegramChat**: Telegram chat configurations

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy with automatic builds on push

### Environment Variables for Production

Ensure all environment variables are set in your Vercel project:
- Database connection string
- API keys (Anthropic, Xero, Telegram)
- Session encryption password
- Admin credentials
- Cron job security token

## Security Considerations

- All API endpoints require authentication
- Session data is encrypted using Iron Session
- Xero tokens are stored securely and refreshed automatically
- Cron jobs are protected with bearer token authentication
- File uploads are validated and processed securely

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure PostgreSQL is running and connection string is correct
2. **Xero Authentication**: Check client ID, secret, and redirect URI configuration
3. **File Upload Errors**: Verify file format and size limits
4. **Cron Job Failures**: Check Vercel function logs and token configuration

### Logs

- Check Vercel function logs for detailed error information
- Monitor database queries using Prisma Studio: `npm run db:studio`
- Enable debug logging in development mode

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with admin user
- `npm run db:studio` - Open Prisma Studio

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.