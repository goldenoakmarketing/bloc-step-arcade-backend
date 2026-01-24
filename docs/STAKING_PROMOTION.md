# BLOC Step Staking Pool Promotion Guide

## Your StakingPool vs Mint Club

| Feature | Your StakingPool | Mint Club #196 |
|---------|------------------|----------------|
| Contract | `0xa3465cfD544c6B11C3BBeD5203AEC739976059D4` | Mint Club managed |
| Rewards | **Automatic weekly** from arcade revenue | Fixed at creation |
| Revenue Share | **60%** of all arcade purchases | None |
| Sustainability | Self-funding from game activity | Depletes over time |
| Control | Full control | No reward additions |

## Key Selling Points

### 1. Revenue-Backed Rewards
"Stake BLOC and earn 60% of ALL arcade revenue. Every quarter purchased feeds the staking pool!"

### 2. Sustainable APY
"Unlike fixed-reward pools that deplete, our staking rewards grow WITH the arcade. More players = more rewards."

### 3. Weekly Distributions
"Rewards distributed every 7 days automatically. No manual claiming required - just stake and earn."

### 4. Direct Game Integration
"Your staked BLOC directly supports the arcade ecosystem while earning you passive income."

## Promotion Channels

### Farcaster Posts

**Announcement Post:**
```
🎮 BLOC Step Staking is LIVE on Base!

Stake $BLOC → Earn 60% of arcade revenue

Unlike other pools, rewards grow WITH the game:
✅ Weekly automatic distributions
✅ Revenue-backed (not fixed supply)
✅ Sustainable long-term APY

Stake now: [your-frontend-url]/stake

Contract: 0xa3465cfD544c6B11C3BBeD5203AEC739976059D4
```

**Migration Post:**
```
📢 Attention Mint Club #196 stakers!

We've launched our official BLOC staking pool with BETTER rewards:

❌ Mint Club: Fixed rewards that deplete
✅ BLOC Pool: 60% of arcade revenue forever

Migrate your stake and earn more:
[your-frontend-url]/stake
```

**Weekly Update Post:**
```
📊 Weekly BLOC Staking Update

This week's distribution:
💰 X,XXX BLOC → Stakers
🎮 From XXX arcade purchases

Current APY: XX%
Total Staked: XXX,XXX BLOC

Stake now: [link]
```

### Discord/Telegram Messages

**Pinned Announcement:**
```
🔥 OFFICIAL BLOC STAKING POOL 🔥

Contract: 0xa3465cfD544c6B11C3BBeD5203AEC739976059D4
Network: Base

How it works:
1. Stake your BLOC tokens
2. Earn 60% of ALL arcade revenue
3. Claim rewards anytime

Why stake with us vs Mint Club?
• Our pool is FUNDED BY REVENUE, not a fixed pot
• As the arcade grows, so do YOUR rewards
• Weekly automatic distributions

👉 Start staking: [link]
```

### Website Copy

**Hero Section:**
```
Stake BLOC. Earn Arcade Revenue.

60% of every arcade purchase flows to stakers.
The more people play, the more you earn.

[Stake Now] [View Pool Stats]
```

**How It Works Section:**
```
1. STAKE
   Deposit your BLOC tokens to the staking pool

2. PLAY (or let others play!)
   Every arcade purchase adds to the reward pool

3. EARN
   Weekly distributions of 60% of all revenue

4. COMPOUND
   Restake your rewards for exponential growth
```

## Technical Integration

### Frontend Staking UI Components Needed

1. **Stake/Unstake Form**
   - Input amount
   - Max button
   - Approve + Stake buttons

2. **Stats Dashboard**
   - Total staked
   - Your stake
   - Pending rewards
   - APY estimate
   - Next distribution countdown

3. **Claim Button**
   - Shows pending rewards
   - One-click claim

### Smart Contract Calls

```typescript
// Stake
stakingPool.stake(amount)

// Unstake
stakingPool.unstake(amount)

// Claim
stakingPool.claimRewards()

// Read user data
stakingPool.getStakedBalance(address)
stakingPool.getPendingRewards(address)

// Read pool data
stakingPool.totalStaked()
stakingPool.rewardPerTokenStored()
```

## Migration Incentive Ideas

1. **Early Staker Bonus**
   - First 100 stakers get 2x rewards for first month

2. **Migration Airdrop**
   - Snapshot Mint Club #196 stakers
   - Airdrop bonus BLOC to those who migrate

3. **Referral Program**
   - 5% bonus on referred stakes for 3 months

4. **Staking Tiers**
   - Bronze: 1,000+ BLOC → Base rewards
   - Silver: 10,000+ BLOC → 1.1x multiplier
   - Gold: 100,000+ BLOC → 1.25x multiplier

## Tracking Success

Monitor these metrics weekly:
- Total BLOC staked
- Number of unique stakers
- Average stake size
- Staker retention rate
- Revenue per staker
- APY trends
