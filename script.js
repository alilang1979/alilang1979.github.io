let selectedYield = 8;
let selectedExpirations = [];

function showError(message) {
    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.innerText = message;
    errorDisplay.classList.add('active');
    setTimeout(() => errorDisplay.classList.remove('active'), 5000);
}

function clearError() {
    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.classList.remove('active');
}

async function fetchMarketData(ticker) {
    const apiKey = 'QEI9SAAQNT1F5S95'; // Replace with your Alpha Vantage API key
    const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
    const historyUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=compact&apikey=${apiKey}`;

    try {
        const quoteResponse = await fetch(quoteUrl);
        if (!quoteResponse.ok) throw new Error('Failed to fetch current price. Check your API key or network.');
        const quoteData = await quoteResponse.json();
        const marketPrice = parseFloat(quoteData['Global Quote']['05. price']);
        if (!marketPrice || isNaN(marketPrice)) throw new Error('Invalid ticker or no price data available.');

        const historyResponse = await fetch(historyUrl);
        if (!historyResponse.ok) throw new Error('Failed to fetch historical data. Check your API key or network.');
        const historyData = await historyResponse.json();
        const timeSeries = historyData['Time Series (Daily)'];
        if (!timeSeries) throw new Error('No historical data available for this ticker.');
        const prices = Object.values(timeSeries).map(day => parseFloat(day['4. close']));
        const lowestPrice = Math.min(...prices);
        if (isNaN(lowestPrice)) throw new Error('Invalid historical price data.');

        return { marketPrice, lowestPrice };
    } catch (error) {
        throw new Error(`Error fetching market data: ${error.message}`);
    }
}

async function calculatePremiums() {
    clearError();
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();
    const currentDate = new Date();
    const expirationDates = selectedExpirations.map(days => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + days);
        return date;
    });

    if (!ticker) {
        showError('Please enter a valid stock ticker.');
        return;
    }
    if (!selectedExpirations.length) {
        showError('Please select at least one expiration period.');
        return;
    }

    try {
        const { marketPrice, lowestPrice } = await fetchMarketData(ticker);
        document.getElementById('marketPriceDisplay').innerHTML = `
            Current Market Price: <span style="color: #276749;">$${marketPrice.toFixed(2)}</span> USD<br>
            3-Month Low: <span style="color: #c53030;">$${lowestPrice.toFixed(2)}</span> USD
        `;

        const totalFeesPerContract = 1.00;
        const strikePercentages = [0.95, 0.90, 0.85, 0.80, 0.75];
        const strikePrices = strikePercentages.map(p => Math.floor(marketPrice * p)).filter(s => s > 0);

        const results = expirationDates.map(expirationDate => {
            const T = (expirationDate - currentDate) / (1000 * 60 * 60 * 24);
            if (T <= 0) throw new Error('Expiration date is in the past.');
            const premiums = strikePrices.map(strike => {
                const grossPremiumPerShare = strike * (selectedYield / 100) * (T / 365);
                const netPremiumPerContract = Math.max((grossPremiumPerShare * 100) - totalFeesPerContract, 0);
                const netPremiumPerShare = netPremiumPerContract / 100;
                const maxLoss = (strike * 100) - (netPremiumPerShare * 100);
                return { netPremium: netPremiumPerShare.toFixed(2), maxLoss: maxLoss.toFixed(2), T };
            });
            return { expirationDate: expirationDate.toISOString().split('T')[0], premiums };
        });

        let tableHTML = '<table><tr><th>Expiration</th>';
        strikePrices.forEach(strike => tableHTML += `<th>${strike} ($)</th>`);
        tableHTML += '</tr>';
        results.forEach((result, rowIndex) => {
            tableHTML += `<tr data-row="${rowIndex}"><td>${result.expirationDate}</td>`;
            result.premiums.forEach((item, colIndex) => {
                tableHTML += `<td data-col="${colIndex}">${item.netPremium}<br><span style="color: #e53e3e;">${item.maxLoss}</span></td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</table>';
        document.getElementById('result').innerHTML = tableHTML;

        sessionStorage.setItem('results', JSON.stringify(results));
        sessionStorage.setItem('strikePrices', JSON.stringify(strikePrices));

        const cells = document.querySelectorAll('#result table td:not(:first-child)');
        cells.forEach(cell => {
            cell.addEventListener('click', function() {
                document.querySelectorAll('#result td').forEach(c => c.classList.remove('highlighted'));
                this.classList.add('highlighted');

                const rowIndex = this.parentElement.getAttribute('data-row');
                const colIndex = this.getAttribute('data-col');
                const result = results[rowIndex];
                const strike = strikePrices[colIndex];
                const premium = result.premiums[colIndex].netPremium;
                const maxLoss = result.premiums[colIndex].maxLoss;
                const expiration = result.expirationDate;

                document.getElementById('clickResult').innerHTML = `
                    If you sell a put option at <span class="strike">$${strike}</span> USD 
                    with an expiration date of <span class="date">${expiration}</span>, 
                    then you will receive <span class="premium">$${(premium * 100).toFixed(2)}</span> USD. 
                    The expected yield is <span class="yield">${selectedYield}%</span>, 
                    with a max potential loss of <span class="loss">$${maxLoss}</span> USD.
                `;

                const reverseInput = document.getElementById('reverseInput');
                reverseInput.classList.add('active');
                reverseInput.dataset.row = rowIndex;
                reverseInput.dataset.col = colIndex; // Store column index for cell-specific yield
            });
        });
    } catch (error) {
        showError(error.message);
        console.error(error);
    }
}

async function calculateYield() {
    clearError();
    const rowIndex = document.getElementById('reverseInput').dataset.row;
    const colIndex = document.getElementById('reverseInput').dataset.col;
    const premiumInput = document.getElementById('premiumInput').value;

    if (!premiumInput || isNaN(premiumInput) || parseFloat(premiumInput) < 0) {
        showError('Please enter a valid premium amount.');
        return;
    }

    try {
        const strikePrices = JSON.parse(sessionStorage.getItem('strikePrices'));
        const results = JSON.parse(sessionStorage.getItem('results'));
        if (!results || !strikePrices) throw new Error('No previous calculation data available. Please calculate premiums first.');

        const result = results[rowIndex];
        const strike = strikePrices[colIndex];
        const expiration = result.expirationDate;
        const T = result.premiums[0].T; // Time to expiration (same for all strikes in row)
        const premium = parseFloat(premiumInput);
        const totalFeesPerContract = 1.00;

        const netPremiumPerContract = (premium * 100) - totalFeesPerContract;
        const netPremiumPerShare = netPremiumPerContract / 100;
        const annualizedYield = (netPremiumPerShare / strike) * (365 / T) * 100;

        document.getElementById('yieldResult').innerHTML = `
            For a premium of <span class="premium">$${premium.toFixed(2)}</span> USD per share 
            at a strike of <span class="strike">$${strike}</span> USD 
            expiring on <span class="date">${expiration}</span>, 
            the annualized yield is <span class="yield">${annualizedYield.toFixed(2)}%</span>.
        `;
    } catch (error) {
        showError(`Error calculating yield: ${error.message}`);
        console.error(error);
    }
}

document.getElementById('yieldButtons').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        document.querySelectorAll('#yieldButtons button').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        selectedYield = parseFloat(e.target.dataset.yield);
    }
});

document.getElementById('expirationButtons').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const days = parseInt(e.target.dataset.days);
        if (e.target.classList.contains('active')) {
            e.target.classList.remove('active');
            selectedExpirations = selectedExpirations.filter(d => d !== days);
        } else {
            e.target.classList.add('active');
            selectedExpirations.push(days);
        }
    }
});

document.getElementById('calculateButton').addEventListener('click', calculatePremiums);
document.getElementById('reverseInput').querySelector('button').addEventListener('click', calculateYield);
