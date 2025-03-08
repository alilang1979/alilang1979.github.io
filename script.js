let selectedYield = 8; // 默认期望年化收益率
let selectedExpirations = []; // 存储用户选择的到期日
let selectedWinRates = []; // 存储用户选择的胜率

// 显示错误信息
function showError(message) {
    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.innerText = message;
    errorDisplay.classList.add('active');
    setTimeout(() => errorDisplay.classList.remove('active'), 5000);
}

// 清除错误信息
function clearError() {
    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.classList.remove('active');
}
function calculateWinRate(S, K, T, sigma) {
    const d1 = (Math.log(S / K) + (0 + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    return normalCDF(d1); // 返回标准正态分布的累积分布函数值
}

// 标准正态分布的累积分布函数
function normalCDF(x) {
    return (1 + erf(x / Math.sqrt(2))) / 2;
}

// 误差函数
function erf(x) {
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
// 计算高胜率点位
function calculateHighWinRatePoint(S, T, sigma, winRate) {
    let bestMatch = null;
    for (let K = Math.floor(S * 0.95); K >= Math.floor(S * 0.7); K -= 1) {
        const d1 = (Math.log(S / K) + (0 + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
        const currentWinRate = normalCDF(d1);
        if (!bestMatch || Math.abs(currentWinRate - winRate) < Math.abs(bestMatch.winRate - winRate)) {
            bestMatch = { strike: K, winRate: currentWinRate };
        }
    }
    return bestMatch;
}

// 标准正态分布的累积分布函数
function normalCDF(x) {
    return (1 + erf(x / Math.sqrt(2))) / 2;
}

// 误差函数
function erf(x) {
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

// 获取市场数据
async function fetchMarketData(ticker, apiKey, forceRefresh = false) {
    const cacheKey = `marketData-${ticker}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (!forceRefresh && cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        if (new Date().getTime() - timestamp < 3600000) return data;
    }

    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`;
    const historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${ticker}?serietype=line&apikey=${apiKey}`;

    try {
        const [quoteResponse, historyResponse] = await Promise.all([fetch(quoteUrl), fetch(historyUrl)]);
        if (!quoteResponse.ok || !historyResponse.ok) throw new Error('Failed to fetch data.');

        const [quoteData, historyData] = await Promise.all([quoteResponse.json(), historyResponse.json()]);
        console.log('Quote Data:', quoteData); // 调试日志
        console.log('History Data:', historyData); // 调试日志

        if (!quoteData || quoteData.length === 0 || !historyData.historical) {
            throw new Error('无法获取股票数据，请检查股票代码或 API Key。');
        }

        const marketPrice = parseFloat(quoteData[0].price);
        if (isNaN(marketPrice)) throw new Error('Invalid market price data.');

        const validPrices = historyData.historical.filter(day => day.close > 0);
        if (validPrices.length === 0) throw new Error('No valid historical price data.');

        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const recentPrices = validPrices.filter(day => new Date(day.date) >= threeMonthsAgo);
        if (recentPrices.length === 0) throw new Error('No valid historical price data in the last 3 months.');

        const lowestPriceData = recentPrices.reduce((min, day) => day.close < min.close ? day : min, recentPrices[0]);
        const lowestPrice = parseFloat(lowestPriceData.close);
        const lowestPriceDate = lowestPriceData.date;

        const priceChanges = recentPrices.map((day, index) => {
            if (index === 0) return 0;
            return Math.log(day.close / recentPrices[index - 1].close);
        });
        const sigma = Math.sqrt(priceChanges.reduce((sum, change) => sum + Math.pow(change, 2), 0) / priceChanges.length) * Math.sqrt(252);

        const marketData = {
            marketPrice,
            lowestPrice,
            lowestPriceDate,
            volatility: sigma,
        };
        localStorage.setItem(cacheKey, JSON.stringify({ data: marketData, timestamp: new Date().getTime() }));
        return marketData;
    } catch (error) {
        throw new Error(`Error fetching market data: ${error.message}`);
    }
}
async function calculateYield() {
    console.log("calculateYield 函数被调用");
    clearError();

    // 获取高亮单元格
    const highlightedCell = document.querySelector('#result td.highlighted');
    if (!highlightedCell) {
        showError('请先点击表格中的某一栏以选择到期日。');
        return;
    }

    // 获取输入值
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
        // 获取高亮单元格的到期日
        const days = highlightedCell.getAttribute('data-days');
        const T = days / 365; // 到期时间（年化）

        // 计算年化收益率
        const strike = parseFloat(strikeInput);
        const premium = parseFloat(premiumInput);
        const annualizedYield = (premium / strike) * (365 / days) * 100;

        // 计算胜率
        const { marketPrice, volatility } = await fetchMarketData(document.getElementById('ticker').value.trim(), document.getElementById('apiKey').value.trim());
        const winRate = calculateWinRate(marketPrice, strike, T, volatility);

        // 显示结果
        document.getElementById('yieldResult').innerHTML = `
            如果权利金是 <span class="premium">$${premium.toFixed(2)}</span> USD 每股, 
            行权价 <span class="strike">$${strike}</span> USD,
            到期日为 <span class="date">${days} 天</span>, 
            则年化收益率为 <span class="yield">${annualizedYield.toFixed(2)}%</span>。<br>
            胜率: <span class="winRate">${(winRate * 100).toFixed(2)}%</span>
        `;
    } catch (error) {
        showError(`计算收益率时出错: ${error.message}`);
        console.error(error);
    }
}
document.getElementById('reverseInput').querySelector('button').addEventListener('click', calculateYield);
// 合并计算函数
async function calculateCombinedResults() {
    clearError();

    const apiKey = document.getElementById('apiKey').value.trim();
    const ticker = document.getElementById('ticker').value.trim().toUpperCase();
    const expirationDays = selectedExpirations;
    const targetYield = selectedYield / 100;

    if (!apiKey || !ticker || !expirationDays.length || !selectedWinRates.length) {
        showError('请填写完整的输入并选择至少一个到期日和胜率。');
        return;
    }

    try {
        // 显示“数据读取中”提示
        document.getElementById('marketPriceDisplay').innerHTML = '数据读取中...';

        const { marketPrice, lowestPrice, lowestPriceDate, volatility } = await fetchMarketData(ticker, apiKey);

        // 验证返回值
        if (isNaN(marketPrice) || isNaN(lowestPrice) || isNaN(volatility)) {
            throw new Error('无法获取有效的市场数据，请检查股票代码或 API Key。');
        }

        // 更新市场价显示
        document.getElementById('marketPriceDisplay').innerHTML = `
            当前市场价: <span style="color: #276749;">$${marketPrice.toFixed(2)}</span> USD
            <button type="button" id="refreshButton" style="margin-left: 10px; padding: 0.25rem 0.5rem; font-size: 0.875rem;">强制刷新</button>
            <br>
             3月内最低价: <span style="color: #c53030;">$${lowestPrice.toFixed(2)}</span> USD (${lowestPriceDate})<br>
            波动率: <span style="color: #744210;">${(volatility * 100).toFixed(2)}%</span>
            <br>
        最后刷新时间: <span style="color: #2b6cb0;">${new Date().toLocaleString()}</span>
`;

        // 计算每个到期日下的高胜率点位
        const currentDate = new Date();
        const results = expirationDays.map(days => {
            const expirationDate = new Date(currentDate);
            expirationDate.setDate(currentDate.getDate() + days);
            const expirationDateStr = expirationDate.toISOString().split('T')[0]; // 格式化为 YYYY-MM-DD

            const winRateResults = selectedWinRates.map(winRate => {
                const bestMatch = calculateHighWinRatePoint(marketPrice, days / 365, volatility, winRate / 100);
                const dropPercentage = ((marketPrice - bestMatch.strike) / marketPrice * 100).toFixed(2);
                const targetPremium = bestMatch.strike * targetYield * (days / 365);
                const maxLoss = (bestMatch.strike * 100) - (targetPremium * 100);
                return { winRate, strike: bestMatch.strike, targetPremium, maxLoss, dropPercentage };
            });
            return { days, expirationDate: expirationDateStr, winRateResults };
        });

        // 显示表格
        displayCombinedResults(results, marketPrice);
    } catch (error) {
        showError(`计算时出错: ${error.message}`);
        console.error(error);
    }
}

// 显示合并结果
function displayCombinedResults(results, marketPrice) {
    if (!results || results.length === 0) {
        document.getElementById('result').innerHTML = '<p>未找到符合条件的点位。</p>';
        return;
    }

    // 构建表格标题
    let tableHTML = '<table><tr><th>到期日</th>';
    selectedWinRates.forEach(winRate => {
        const winRateResult = results[0].winRateResults.find(result => result.winRate === winRate);
        if (!winRateResult) return; // 如果未找到对应的胜率结果，跳过

        const dropPercentage = winRateResult.dropPercentage;
        const arrow = dropPercentage > 0 ? `<span style="color: #c53030;">↓${dropPercentage}%</span>` : '';
        tableHTML += `<th>${winRate}% 胜率点位<br>(${arrow})</th>`;
    });
    tableHTML += '</tr>';

    // 构建表格内容
    results.forEach(result => {
        tableHTML += `<tr><td>${result.expirationDate}</td>`;
        result.winRateResults.forEach(winRateResult => {
            const { strike, targetPremium, maxLoss } = winRateResult;
            tableHTML += `
                <td data-strike="${strike}" data-premium="${targetPremium}" data-days="${result.days}">
                    行权价: $${strike}<br>
                    权利金: $${targetPremium.toFixed(2)}<br>
                    最大损失: $${maxLoss.toFixed(2)}
                </td>
            `;
        });
        tableHTML += '</tr>';
    });
    tableHTML += '</table>';

    // 显示表格
    document.getElementById('result').innerHTML = tableHTML;

    // 绑定点击事件
    const cells = document.querySelectorAll('#result table td');
    cells.forEach(cell => {
        cell.addEventListener('click', async function() {
            // 移除其他单元格的高亮
            document.querySelectorAll('#result td').forEach(c => c.classList.remove('highlighted'));
            // 高亮当前点击的单元格
            this.classList.add('highlighted');

            const strike = this.getAttribute('data-strike');
            const premium = this.getAttribute('data-premium');
            const days = this.getAttribute('data-days');

            // 获取市场数据以计算胜率
            const apiKey = document.getElementById('apiKey').value.trim();
            const ticker = document.getElementById('ticker').value.trim().toUpperCase();
            const { marketPrice, volatility } = await fetchMarketData(ticker, apiKey);

            // 计算胜率
            const T = days / 365;
            const winRate = calculateWinRate(marketPrice, strike, T, volatility);

            // 显示详细说明
            document.getElementById('clickResult').innerHTML = `
                如果你sell put在<span class="strike">$${strike}</span> USD,
                到期日 <span class="date">${result.expirationDate}</span>, 
                如果未被行权则你会得到 <span class="premium">$${(premium * 100).toFixed(2)}</span> USD,
                年化收益率是 <span class="yield">${selectedYield}%</span>。<br>
                如果被行权，最大可能损失为： <span class="loss">$${(strike * 100 - premium * 100).toFixed(2)}</span> USD,<br>
                胜率（Black-Scholes 模型）: <span class="winRate">${(winRate * 100).toFixed(2)}%</span>
            `;

            // 显示反向输入框
            const reverseInput = document.getElementById('reverseInput');
            reverseInput.classList.add('active');
            document.getElementById('strikeInput').value = strike;
            document.getElementById('premiumInput').value = premium;
        });
    });
}
document.getElementById('reverseInput').querySelector('button').addEventListener('click', async () => {
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
        const strike = parseFloat(strikeInput);
        const premium = parseFloat(premiumInput);
        const days = document.querySelector('#result td.highlighted').getAttribute('data-days');
        const T = days / 365;

        // 计算年化收益率
        const annualizedYield = (premium / strike) * (365 / days) * 100;

        // 计算胜率
        const { marketPrice, volatility } = await fetchMarketData(document.getElementById('ticker').value.trim(), document.getElementById('apiKey').value.trim());
        const winRate = calculateWinRate(marketPrice, strike, T, volatility);

        // 显示结果
        document.getElementById('yieldResult').innerHTML = `
            如果权利金是 <span class="premium">$${premium.toFixed(2)}</span> USD 每股, 
            行权价 <span class="strike">$${strike}</span> USD,
            到期日为 <span class="date">${days} 天</span>, 
            则年化收益率为 <span class="yield">${annualizedYield.toFixed(2)}%</span>。<br>
            胜率: <span class="winRate">${(winRate * 100).toFixed(2)}%</span>
        `;
    } catch (error) {
        showError(`计算收益率时出错: ${error.message}`);
        console.error(error);
    }
});

// 绑定事件
document.addEventListener('DOMContentLoaded', () => {
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

    document.getElementById('yieldButtons').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelectorAll('#yieldButtons button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            selectedYield = parseFloat(e.target.dataset.yield);
        }
    });

    document.getElementById('winRateButtons').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const winRate = parseFloat(e.target.dataset.winRate);
            if (e.target.classList.contains('active')) {
                e.target.classList.remove('active');
                selectedWinRates = selectedWinRates.filter(rate => rate !== winRate);
            } else {
                e.target.classList.add('active');
                selectedWinRates.push(winRate);
            }
        }
    });

    document.getElementById('calculateCombinedButton').addEventListener('click', calculateCombinedResults);
    // 绑定强制刷新按钮事件
    document.getElementById('marketPriceDisplay').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'refreshButton') {
            const ticker = document.getElementById('ticker').value.trim().toUpperCase();
            const apiKey = document.getElementById('apiKey').value.trim();
            fetchMarketData(ticker, apiKey, true).then(data => {
                // 更新市场价显示
                document.getElementById('marketPriceDisplay').innerHTML = `
                    当前市场价: <span style="color: #276749;">$${data.marketPrice.toFixed(2)}</span> USD
                    <button type="button" id="refreshButton" style="margin-left: 10px; padding: 0.25rem 0.5rem; font-size: 0.875rem;">强制刷新</button>
                    <br>
                    3月内最低价: <span style="color: #c53030;">$${data.lowestPrice.toFixed(2)}</span> USD (${data.lowestPriceDate})<br>
                    波动率: <span style="color: #744210;">${(data.volatility * 100).toFixed(2)}%</span>
                    <br>
                    最后刷新时间: <span style="color: #2b6cb0;">${new Date().toLocaleString()}</span>
                `;
            }).catch(error => {
                showError(`强制刷新失败: ${error.message}`);
            });
        }
    });
});
