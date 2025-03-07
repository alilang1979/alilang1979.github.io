async function calculatePremiums() {
    console.log("Button clicked");
    
    // Get input values
    const ticker = document.getElementById('ticker').value.toUpperCase();
    const expirationDate = new Date(document.getElementById('expirationDate').value);
    const expectedYield = parseFloat(document.getElementById('expectedYield').value);
    const currentDate = new Date('2025-03-06');
    
    // Fetch market price from Alpha Vantage
    const apiKey = 'QEI9SAAQNT1F5S95'; // Replace with your Alpha Vantage API key
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
    let marketPrice;
    
    try {
    const response = await fetch(url);
    const data = await response.json();
    marketPrice = parseFloat(data['Global Quote']['05. price']);
    if (!marketPrice) throw new Error('Invalid ticker or no price data');
    document.getElementById('marketPriceDisplay').innerText =
    `Current Market Price: $${marketPrice.toFixed(2)}`;
    } catch (error) {
    document.getElementById('result').innerText =
    'Error: Could not fetch market price. Check ticker or API key.';
    console.error(error);
    return;
    }
    
    // Calculate time to expiration in days
    const timeDiff = expirationDate - currentDate;
    const T = timeDiff / (1000 * 60 * 60 * 24);
    
    // Validate inputs
    if (T <= 0) {
    document.getElementById('result').innerText =
    'Error: Expiration date must be after March 6, 2025.';
    return;
    }
    if (marketPrice <= 0 || expectedYield <= 0) {
    document.getElementById('result').innerText =
    'Error: Market price and expected yield mustprototypesmust be positive.';
    return;
    }
    
    // IBKR Pro commission and fees (per contract, 1 contract per strike)
    const baseCommission = 0.65; // IBKR Pro base commission per contract
    const exchangeFee = 0.30; // Average exchange fee per contract
    const clearingFee = 0.05; // OCC clearing fee per contract
    const totalFeesPerContract = baseCommission + exchangeFee + clearingFee; // $1.00 per contract
    
    // Generate strike prices (95%, 90%, 85%, 80%, 75% of market price, rounded down)
    const strikePrices = [];
    for (let i = 0; i < 5; i++) {
    const percentage = 0.95 - (i * 0.05);
    const strike = Math.floor(marketPrice * percentage);
    if (strike > 0) {
    strikePrices.push(strike);
    }
    }
    
    // Calculate premiums with commission and fees deducted (1 contract per strike)
    const premiums = strikePrices.map(strike => {
    const grossPremiumPerShare = strike * (expectedYield / 100) * (T / 365);
    const grossPremiumPerContract = grossPremiumPerShare * 100; // 100 shares per contract
    const netPremiumPerContract = Math.max(grossPremiumPerContract - totalFeesPerContract, 0);
    const netPremiumPerShare = netPremiumPerContract / 100; // Back to per-share for display
    return {
    strike,
    grossPremium: grossPremiumPerShare.toFixed(4),
    netPremium: netPremiumPerShare.toFixed(4),
    commission: totalFeesPerContract.toFixed(2)
    };
    });
    
    // Generate result table with commission column
    let tableHTML = '<table><tr><th>Strike Price ($)</th><th>Net Premium ($)</th><th>Expected Commission & Fees ($)</th></tr>';
    premiums.forEach((item, index) => {
    tableHTML += `<tr data-index="${index}"><td>${item.strike}</td><td>${item.netPremium}</td><td>${item.commission}</td></tr>`;
    });
    tableHTML += '</table>';
    document.getElementById('result').innerHTML = tableHTML;
    
    // Add click event listeners
    const rows = document.querySelectorAll('#result table tr:not(:first-child)');
    rows.forEach(row => {
    row.addEventListener('click', function() {
    const index = this.getAttribute('data-index');
    const selected = premiums[index];
    const usdAmount = (selected.netPremium * 100).toFixed(2); // Total net for 1 contract
    const message = `You will get ${usdAmount} USD, expected commissions & fees are ${selected.commission} USD in ${T} days, the expected yield is ${expectedYield}%`;
    document.getElementById('clickResult').innerText = message;
    });
    });
    }