# Quick Start Guide

Get your Solana blockchain integration running in minutes!

## Prerequisites

- Node.js >= 18.x
- Solana CLI installed
- At least 2 SOL on devnet (for testing)

## 1. Install Solana CLI

### Windows (PowerShell)
```powershell
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
$env:PATH += ";$HOME\.local\share\solana\install\active_release\bin"
solana --version
```

### Mac/Linux
```bash
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version
```

## 2. Install Anchor CLI

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
anchor --version
```

## 3. Generate Keypair

```bash
# Generate admin keypair
solana-keygen new --outfile ~/.config/solana/id.json

# View your public key
solana-keygen pubkey ~/.config/solana/id.json

# Set config to devnet
solana config set --url https://api.devnet.solana.com
solana config set --keypair ~/.config/solana/id.json
```

## 4. Get Devnet SOL

```bash
# Request airdrop (can be run multiple times)
solana airdrop 2

# Check balance
solana balance
```

## 5. Install Dependencies

```bash
cd blockchain
npm install
# or
yarn install
```

## 6. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
```

## 7. Build & Deploy

```bash
# Build the program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Note the Program ID from output!
```

## 8. Update Program ID

After deployment, update the Program ID in these files:

1. `Anchor.toml` - Update `[programs.devnet]` section
2. `programs/loan-management/src/lib.rs` - Update `declare_id!()` macro
3. `.env` - Update `SOLANA_PROGRAM_ID`

Then rebuild:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

## 9. Initialize Program

```bash
# Copy your admin keypair
cp ~/.config/solana/id.json ./admin-keypair.json

# Run initialization script
ts-node scripts/initialize-program.ts
```

## 10. Test Integration

```bash
# Run full integration test
ts-node scripts/test-integration.ts

# Run Anchor tests
anchor test
```

## Common Commands

```bash
# Check Solana config
solana config get

# View program info
solana program show <PROGRAM_ID>

# View account info
solana account <ACCOUNT_ADDRESS>

# View transaction
solana confirm <SIGNATURE> -v

# Airdrop more SOL
solana airdrop 2

# Check balance
solana balance
```

## Verify Deployment

Visit Solana Explorer:
- Devnet: https://explorer.solana.com/?cluster=devnet
- Search for your Program ID

## Next Steps

1. **Integrate with Backend**: See `docs/INTEGRATION_GUIDE.md`
2. **Set up Frontend**: Add blockchain queries to frontend
3. **Deploy to Mainnet**: See `docs/MAINNET_DEPLOYMENT.md`
4. **Monitor**: Set up logging and monitoring

## Troubleshooting

### "Insufficient funds"
```bash
solana airdrop 2
```

### "Program already exists"
- You're trying to initialize twice
- Check if already initialized: `ts-node scripts/check-state.ts`

### "Transaction simulation failed"
- Check your balance: `solana balance`
- Verify program ID is correct
- Check RPC endpoint is accessible

### Build Errors
```bash
# Clean and rebuild
anchor clean
cargo clean
anchor build
```

## Support

- Documentation: `/docs`
- Issues: GitHub Issues
- Community: Solana Discord

## Success! 🎉

If everything worked, you should see:
- Program deployed and initialized
- Test transactions confirmed
- Blockchain integration ready

Now you can integrate with your backend!
