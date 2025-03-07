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

// 计算胜率的函数
function calculateWinRate(S, K, T, sigma) {
    const d1 = (Math.log(S / K) + (0 + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    return normalCDF(d1); // 返回标准正态分布的累积分布函数值
}

function erf(x) {
    // 使用近似公式计算误差函数
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

// 标准正态分布的累积分布函数
function normalCDF(x) {
    return (1 + erf(x / Math.sqrt(2))) / 2;
}

// 在 fetchMarketData 中获取波动率数据
// 修改 fetchMarketData 函数，增加 forceRefresh 参数
async function fetchMarketData(ticker, apiKey, forceRefresh = false) {
    // 显示“数据读取中”
    document.getElementById('marketPriceDisplay').innerHTML = '数据读取中...';

    const cacheKey = `marketData-${ticker}`;
    const cachedData = localStorage.getItem(cacheKey);

    // 如果 forceRefresh 为 true，则忽略缓存
    if (!forceRefresh && cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        const now = new Date().getTime();
        if (now - timestamp < 3600000) { // 1小时 = 3600000毫秒
            console.log('Using cached data for', ticker);
            return data; // 返回缓存的数据
        }
    }

    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
    const historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?serietype=line&apikey=${apiKey}`;

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

        // 计算历史波动率
        const priceChanges = recentPrices.map((day, index) => {
            if (index === 0) return 0;
            return Math.log(day.close / recentPrices[index - 1].close);
        });
        const sigma = Math.sqrt(priceChanges.reduce((sum, change) => sum + Math.pow(change, 2), 0) / priceChanges.length) * Math.sqrt(252); // 年化波动率

        // 将数据存入缓存（包含时间戳）
        const marketData = {
            marketPrice,
            marketPriceDate,
            lowestPrice: lowestPriceData.close,
            lowestPriceDate: lowestPriceData.date,
            volatility: sigma, // 波动率
        };
        localStorage.setItem(cacheKey, JSON.stringify({ data: marketData, timestamp: new Date().getTime() })); // 存储到localStorage
        console.log('Data cached for', ticker);

        return marketData;
    } catch (error) {
        throw new Error(`Error fetching market data: ${error.message}`);
    }
}

// 绑定“强制刷新”按钮的点击事件
document.getElementById('refreshButton').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();

    if (!apiKey) {
        showError('请输入有效的 API 密钥。');
        return;
    }
    if (!ticker) {
        showError('请输入有效的股票代码。');
        return;
    }

    try {
        // 强制刷新数据
        const marketData = await fetchMarketData(ticker, apiKey, true);
        document.getElementById('marketPriceDisplay').innerHTML = `
            当前市场价: <span style="color: #276749;">$${marketData.marketPrice.toFixed(2)}</span> USD (${marketData.marketPriceDate})<br>
            3月内最低价: <span style="color: #c53030;">$${marketData.lowestPrice.toFixed(2)}</span> USD (${marketData.lowestPriceDate})<br>
            波动率: <span style="color: #744210;">${(marketData.volatility * 100).toFixed(2)}%</span>
        `;
    } catch (error) {
        showError(error.message);
        console.error(error);
    }
});

// 在 calculatePremiums 中计算胜率
// 其他代码保持不变...

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
        showError('请输入有效的 API 密钥。');
        return;
    }
    if (!ticker) {
        showError('请输入有效的股票代码。');
        return;
    }
    if (!selectedExpirations.length) {
        showError('请选择至少一个到期时间。');
        return;
    }

    try {
        const { marketPrice, marketPriceDate, lowestPrice, lowestPriceDate, volatility } = await fetchMarketData(ticker, apiKey);
        document.getElementById('marketPriceDisplay').innerHTML = `
            当前市场价: <span style="color: #276749;">$${marketPrice.toFixed(2)}</span> USD (${marketPriceDate})<br>
            3月内最低价: <span style="color: #c53030;">$${lowestPrice.toFixed(2)}</span> USD (${lowestPriceDate})<br>
            波动率: <span style="color: #744210;">${(volatility * 100).toFixed(2)}%</span>
        `;

        const totalFeesPerContract = 1.00;
        const strikePercentages = [0.95, 0.90, 0.85, 0.80, 0.75];
        const strikePrices = strikePercentages.map(p => Math.floor(marketPrice * p)).filter(s => s > 0);

        const results = expirationDates.map(expirationDate => {
            const T = (expirationDate - currentDate) / (1000 * 60 * 60 * 24) / 365; // 年化时间
            if (T <= 0) throw new Error('到期时间已过。');
            const premiums = strikePrices.map(strike => {
                const grossPremiumPerShare = strike * (selectedYield / 100) * T;
                const netPremiumPerContract = Math.max((grossPremiumPerShare * 100) - totalFeesPerContract, 0);
                const netPremiumPerShare = netPremiumPerContract / 100;
                const maxLoss = (strike * 100) - (netPremiumPerShare * 100);
                const winRate = calculateWinRate(marketPrice, strike, T, volatility); // 计算胜率
                return { netPremium: netPremiumPerShare.toFixed(2), maxLoss: maxLoss.toFixed(2), winRate: (winRate * 100).toFixed(2), T };
            });
            return { expirationDate: expirationDate.toISOString().split('T')[0], premiums };
        });

        let tableHTML = '<table><tr><th>到期日</th>';
        strikePrices.forEach(strike => tableHTML += `<th>${strike} ($)</th>`);
        tableHTML += '</tr>';
        results.forEach((result, rowIndex) => {
            tableHTML += `<tr data-row="${rowIndex}"><td>${result.expirationDate}</td>`;
            result.premiums.forEach((item, colIndex) => {
                tableHTML += `<td data-col="${colIndex}">${item.netPremium}<br><span style="color: #e53e3e;">${item.maxLoss}</span><br><span style="color: #744210;">胜率: ${item.winRate}%</span></td>`;
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
                const winRate = result.premiums[colIndex].winRate;
                const expiration = result.expirationDate;

                document.getElementById('clickResult').innerHTML = `
                    如果你sell put在<span class="strike">$${strike}</span> USD,
                    到期日 <span class="date">${expiration}</span>, 
                    如果未被行权则你会得到 <span class="premium">$${(premium * 100).toFixed(2)}</span> USD,
                    年化收益率是 <span class="yield">${selectedYield}%</span>。<br>
                    如果被行权，最大可能损失为： <span class="loss">$${maxLoss}</span> USD,<br>
                    胜率（Black-Scholes 模型）: <span class="winRate">${winRate}%</span>
                `;

                // 填充 reverseInput 的默认值
                const reverseInput = document.getElementById('reverseInput');
                reverseInput.classList.add('active');
                reverseInput.dataset.row = rowIndex;
                reverseInput.dataset.col = colIndex;

                // 设置默认的 Strike 和 Premium
                document.getElementById('strikeInput').value = strike;
                document.getElementById('premiumInput').value = premium;
            });
        });
    } catch (error) {
        showError(error.message);
        console.error(error);
    }
}

// 计算收益率的函数
async function calculateYield() {
    clearError();
    const rowIndex = document.getElementById('reverseInput').dataset.row;
    const colIndex = document.getElementById('reverseInput').dataset.col;
    const strikeInput = document.getElementById('strikeInput').value;
    const premiumInput = document.getElementById('premiumInput').value;

    if (!strikeInput || isNaN(strikeInput) || parseFloat(strikeInput) < 0) {
        showError('请输入有效的行权价。');
        return;
    }
    if (!premiumInput || isNaN(premiumInput) || parseFloat(premiumInput) < 0) {
        showError('请输入有效的权利金金额。');
        return;
    }

    try {
        const strikePrices = JSON.parse(sessionStorage.getItem('strikePrices'));
        const results = JSON.parse(sessionStorage.getItem('results'));
        if (!results || !strikePrices) throw new Error('没有之前的计算数据。请先计算溢价。');

        const result = results[rowIndex];
        const strike = parseFloat(strikeInput);
        const expiration = result.expirationDate;
        const T = result.premiums[0].T; // 到期时间（年化）
        const premium = parseFloat(premiumInput);
        const totalFeesPerContract = 1.00;

        // 计算净溢价和年化收益率
        const netPremiumPerContract = (premium * 100) - totalFeesPerContract;
        const netPremiumPerShare = netPremiumPerContract / 100;
        const annualizedYield = (netPremiumPerShare / strike) * (365 / (T * 365)) * 100;

        // 计算胜率
        const { marketPrice, volatility } = await fetchMarketData(document.getElementById('ticker').value.trim(), document.getElementById('apiKey').value.trim());
        const winRate = calculateWinRate(marketPrice, strike, T, volatility);

        // 显示结果
        document.getElementById('yieldResult').innerHTML = `
            如果权利金是 <span class="premium">$${premium.toFixed(2)}</span> USD 每股, 
            行权价 <span class="strike">$${strike}</span> USD,
            到期日为 <span class="date">${expiration}</span>, 
            则年化收益率为 <span class="yield">${annualizedYield.toFixed(2)}%</span>。<br>
            胜率: <span class="winRate">${(winRate * 100).toFixed(2)}%</span>
        `;
    } catch (error) {
        showError(`计算收益率时出错: ${error.message}`);
        console.error(error);
    }
}

// 绑定事件监听器
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
