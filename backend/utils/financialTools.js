// server/utils/financialTools.js

exports.calculateProjection = (data) => {
    return new Promise((resolve) => {
        try {
            // data = { currentRevenue, currentExpenses, revenueGrowth (%), expenseGrowth (%) }
            
            const currentRev = parseFloat(data.currentRevenue);
            const currentExp = parseFloat(data.currentExpenses);
            const revGrowth = parseFloat(data.revenueGrowth) / 100; // e.g. 20 becomes 0.20
            const expGrowth = parseFloat(data.expenseGrowth) / 100;

            const projectedRevenue = currentRev * (1 + revGrowth);
            const projectedExpenses = currentExp * (1 + expGrowth);
            const newProfit = projectedRevenue - projectedExpenses;
            const currentProfit = currentRev - currentExp;
            
            const profitChange = ((newProfit - currentProfit) / currentProfit) * 100;

            const report = `
            📊 **Financial Projection Analysis**
            -----------------------------------
            **Current Status:**
            - Revenue: $${currentRev.toLocaleString()}
            - Expenses: $${currentExp.toLocaleString()}
            - Profit: $${currentProfit.toLocaleString()}

            **Projected Scenario:**
            - New Revenue (+${data.revenueGrowth}%): $${projectedRevenue.toLocaleString()}
            - New Expenses (+${data.expenseGrowth}%): $${projectedExpenses.toLocaleString()}
            - **New Profit:** $${newProfit.toLocaleString()}
            
            -----------------------------------
            📈 **Conclusion:** Your profit would change by **${profitChange.toFixed(2)}%**.
            `;

            console.log("💰 Financial Model Run Successfully");
            resolve({ 
                success: true, 
                text: report 
            });

        } catch (error) {
            resolve({ success: false, text: "Error calculating financial model." });
        }
    });
};