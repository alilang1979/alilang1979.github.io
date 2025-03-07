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

async function fetchMarketData(ticker, apiKey) {
    const cacheKey = `marketData-${ticker}`;
    const cachedData = localStorage.getItem(cacheKey);

    // 检查缓存是否存在且未过期（1小时内）
    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        const now = new Date().getTime();
        if (now - timestamp < 3600000) { // 1小时 = 3600000毫秒
            console.log('Using cached data for', ticker);
            return data; // 返回缓存的数据
        }
    }

    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;

    try {
        const quoteResponse = await fetch(quoteUrl);
        if (!quoteResponse.ok) throw new Error('Failed to fetch current price. Check your API key or network.');
        const quoteData = await quoteResponse.json();
        console.log('FMP API Response:', quoteData); // 记录API响应

        // FMP返回一个数组，取第一个元素
        if (!quoteData || quoteData.length === 0) throw new Error('Invalid ticker or no price data available.');
        const marketPrice = parseFloat(quoteData[0].price);
        const marketPriceDate = new Date().toISOString().split('T')[0]; // 使用当前日期作为市价的日期
        if (!marketPrice || isNaN(marketPrice)) throw new Error('Invalid market price data.');

        // 获取历史数据（3个月最低价）
        const historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?serietype=line&apikey=${apiKey}`;
        const historyResponse = await fetch(historyUrl);
        if (!historyResponse.ok) throw new Error('Failed to fetch historical data. Check your API key or network.');
        const historyData = await historyResponse.json();
        console.log('FMP Historical Data:', historyData); // 记录历史数据

        if (!historyData.historical || historyData.historical.length === 0) throw new Error('No historical data available for this ticker.');

        // 过滤掉无效的历史数据（价格为0或NaN）
        const validPrices = historyData.historical
            .filter(day => day.close > 0 && !isNaN(day.close)) // 过滤无效数据
            .map(day => ({ close: day.close, date: day.date })); // 只保留收盘价和日期

        if (validPrices.length === 0) throw new Error('No valid historical price data available.');

        // 找到3个月内的最低价
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const recentPrices = validPrices.filter(day => new Date(day.date) >= threeMonthsAgo);
        if (recentPrices.length === 0) throw new Error('No valid historical price data in the last 3 months.');
        const lowestPriceData = recentPrices.reduce((min, day) => day.close < min.close ? day : min, recentPrices[0]);

        // 将数据存入缓存（包含时间戳）
        const marketData = {
            marketPrice,
            marketPriceDate,
            lowestPrice: lowestPriceData.close,
            lowestPriceDate: lowestPriceData.date,
        };
        localStorage.setItem(cacheKey, JSON.stringify({ data: marketData, timestamp: new Date().getTime() })); // 存储到localStorage
        console.log('Data cached for', ticker);

        return marketData;
    } catch (error) {
        throw new Error(`Error fetching market data: ${error.message}`);
    }
}

async function calculatePremiums() {
    clearError();
    const apiKey = document.getElementById('apiKey').value.trim();
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();
    const currentDate = new Date();
    const expirationDates = selectedExpirations.map(days => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + days);
        return date;
    });

    if (!apiKey) {
        showError('Please enter a valid API key.');
        return;
    }
    if (!ticker) {
        showError('Please enter a valid stock ticker.');
        return;
    }
    if (!selectedExpirations.length) {
        showError('Please select at least one expiration period.');
        return;
    }

    try {
        const { marketPrice, marketPriceDate, lowestPrice, lowestPriceDate } = await fetchMarketData(ticker, apiKey);
        document.getElementById('marketPriceDisplay').innerHTML = `
            Current Market Price: <span style="color: #276749;">$${marketPrice.toFixed(2)}</span> USD (${marketPriceDate})<br>
            3-Month Low: <span style="color: #c53030;">$${lowestPrice.toFixed(2)}</span> USD (${lowestPriceDate})
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
                reverseInput.dataset.col = colIndex; // 存储列索引以计算收益率
            });
        });
    } catch (error) {
        showError(error.message);
        console.error(error);
    }
}

// 其他函数保持不变...

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
        const T = result.premiums[0].T; // 到期时间（同一行的所有行权价相同）
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
