export const topics = {
 valuation: {name:'Valuation',icon:'↗',rule:'Post-money = pre-money + new cash. New investor ownership = new cash ÷ post-money.'},
 dilution: {name:'Dilution',icon:'◔',rule:'Multiply what you own by what you keep. Two rounds of 20% dilution leave 80% × 80% = 64% of your original stake.'},
 safe: {name:'Post-money SAFEs',icon:'◇',rule:'When the cap determines conversion: ownership before the priced round = investment ÷ post-money cap. The priced round dilutes that stake.'},
 pool: {name:'Option pools',icon:'▦',rule:'A new pool carved out of the pre-money comes from existing holders. With no existing pool: old holders keep 100% − investor % − final pool %.'},
 prorata: {name:'Pro rata',icon:'⇄',rule:'To maintain your stake, invest your current ownership × total new cash in the round (including your check).'},
 price: {name:'Share price',icon:'÷',rule:'Price per share = pre-money valuation ÷ pre-round fully diluted shares. New shares = new cash ÷ price per share.'},
 exit: {name:'Exit waterfall',icon:'↳',rule:'With 1× non-participating preferred, the investor takes the larger of their investment or their as-converted share of proceeds, capped at total proceeds.'},
 decision: {name:'Deal decisions',icon:'⚖',rule:'Compare what you retain after both the investment and any pool carve-out. A higher headline valuation can still leave you with less.'}
};
export const round = n => Math.round((n + Number.EPSILON)*100)/100;
export const fmt = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(round(n));
export const money = n => `$${fmt(n)}M`;
export const formulas = {
 ownership:(pre,cash)=>100*cash/(pre+cash),
 dilute:(stake,sold)=>stake*(1-sold/100),
 safe:(cash,cap)=>100*cash/cap,
 pool:(stake,investor,pool)=>stake*(1-(investor+pool)/100),
 prorata:(stake,cash)=>stake/100*cash,
 price:(pre,shares)=>pre/shares,
 exit:(proceeds,invested,stake)=>Math.min(proceeds,Math.max(invested,proceeds*stake/100))
};
const pick=(xs,rng)=>xs[Math.floor(rng()*xs.length)];
export function generate(topic,rng=Math.random) {
 let q; const p=xs=>pick(xs,rng); const pre=p([6,8,12,16,20,24,30,40]); const cash=round(pre/p([2,3,4,5])); const stake=p([40,50,60,70,80]);
 if(topic==='valuation') {const answer=formulas.ownership(pre,cash); q={prompt:`You raise ${money(cash)} at a ${money(pre)} pre-money valuation. What does the new investor own?`,facts:[['Pre-money',money(pre)],['New cash',money(cash)]],answer,unit:'%',explain:`Post-money is ${money(pre+cash)}. Divide ${money(cash)} by ${money(pre+cash)}: ${fmt(answer)}%.`,trap:'Divide by post-money, not pre-money.'};}
 if(topic==='dilution') {const a=p([10,20,25]),b=p([10,20,25]); const answer=formulas.dilute(formulas.dilute(stake,a),b);q={prompt:`You own ${stake}%. A seed round sells ${a}% of the company, then Series A sells ${b}%. What do you own now?`,facts:[['Your stake',`${stake}%`],['Two rounds',`${a}% → ${b}%`]],answer,unit:'%',explain:`${stake}% × ${fmt(1-a/100)} × ${fmt(1-b/100)} = ${fmt(answer)}%.`,trap:'Dilution compounds. Do not subtract percentage points from your stake.'};}
 if(topic==='safe') {const cap=p([5,8,10,12,20]),investment=cap*p([.05,.1,.15]),d=p([10,20,25]);const answer=formulas.dilute(formulas.safe(investment,cap),d);q={prompt:`A ${money(investment)} post-money SAFE has a ${money(cap)} cap. It converts at the cap, then new money buys ${d}% of the company. What does the SAFE investor own after the round?`,facts:[['SAFE / cap',`${money(investment)} / ${money(cap)}`],['New money owns',`${d}%`]],answer,unit:'%',explain:`Before new money: ${money(investment)} ÷ ${money(cap)} = ${fmt(formulas.safe(investment,cap))}%. Then multiply by ${fmt(1-d/100)} → ${fmt(answer)}%.`,trap:'A post-money SAFE percentage is measured before new priced-round money.',assumption:'Cap controls conversion; no discount, pool increase, or other securities.'};}
 if(topic==='pool') {const inv=p([10,20,25]),pool=p([10,15,20]);const answer=formulas.pool(stake,inv,pool);q={prompt:`You own ${stake}% today. New investors will own ${inv}% after closing. A new option pool, carved out of the pre-money, will be ${pool}% after closing. Your final stake?`,facts:[['Investor',`${inv}% final`],['New pool',`${pool}% final`]],answer,unit:'%',explain:`Existing holders together keep ${100-inv-pool}%. Your ${stake}% of that is ${stake}% × ${fmt((100-inv-pool)/100)} = ${fmt(answer)}%.`,trap:'Both percentages are final ownership. The pre-money pool is borne by existing holders.',assumption:'No existing option pool, SAFEs, or other changes.'};}
 if(topic==='prorata') {const own=p([5,10,15,20]),raise=p([2,4,5,8,10]);const answer=formulas.prorata(own,raise);q={prompt:`You own ${own}% and want to maintain it in a ${money(raise)} round. How much must you invest?`,facts:[['Current stake',`${own}%`],['Total round',money(raise)]],answer,unit:'$M',explain:`${own}% × ${money(raise)} = ${money(answer)}. Your check buys your share of the new issuance.`,trap:'The total round includes your check.',assumption:'Same share price for all new cash; no pool increase or conversions.'};}
 if(topic==='price') {const shares=p([2,4,5,8,10]);const answer=formulas.price(pre,shares);q={prompt:`A company has ${shares}M fully diluted shares and a ${money(pre)} pre-money valuation. What is the price per share?`,facts:[['Pre-money',money(pre)],['FD shares',`${shares}M`]],answer,unit:'$',explain:`${money(pre)} ÷ ${shares}M shares = $${fmt(answer)} per share. The millions cancel.`,trap:'Use the pre-round fully diluted share count.',assumption:'Share count already includes all pre-round dilution.'};}
 if(topic==='exit') {const investment=p([1,2,3,4]),own=p([10,20,25]),proceeds=investment*p([2,3,4,5,8]);const answer=formulas.exit(proceeds,investment,own);q={prompt:`An investor put in ${money(investment)} for ${own}% with 1× non-participating preferred. The company exits for ${money(proceeds)}. How much does the investor receive?`,facts:[['Preference',`${money(investment)} · 1×`],['Exit proceeds',money(proceeds)]],answer,unit:'$M',explain:`Preference: ${money(investment)}. Conversion: ${own}% × ${money(proceeds)} = ${money(proceeds*own/100)}. Choose the larger: ${money(answer)}.`,trap:'Non-participating means preference OR conversion, not both.',assumption:'One preferred class; proceeds are net of debt and costs; no dividends.'};}
 if(topic==='decision') {const raise=p([2,3,4]),aPre=raise*4,bPre=raise*5,pool=p([5,10,15]),a=80,b=100-100/6-pool;const answer=a>b?'Offer A':'Offer B';q={prompt:'You own 100%. Which offer leaves you with more ownership after closing?',facts:[['Offer A',`${money(raise)} at ${money(aPre)} pre · no pool`],['Offer B',`${money(raise)} at ${money(bPre)} pre · ${pool}% final pool`]],answer,unit:'choice',explain:`A: 1 − ${fmt(raise)}/${fmt(aPre+raise)} = 80%. B: 1 − ${fmt(raise)}/${fmt(bPre+raise)} − ${pool}% = ${fmt(b)}%. ${answer} preserves more ownership.`,trap:'A higher valuation can be offset by a pre-money pool carve-out.',assumption:'No existing pool or convertibles. B’s pool is carved out of the pre-money. Compare ownership only.',choices:['Offer A','Offer B']};}
 if(!q) throw new Error('Unknown topic');
 q.topic=topic;q.answer=typeof q.answer==='number'?round(q.answer):q.answer;
 if(!q.choices) {const values=new Set([q.answer]); const offsets=[-10,10,-5,5,-2,2,-1,1,.5,-.5];for(const delta of offsets.sort(()=>rng()-.5)) {const v=round(q.answer+delta); if(v>0&&(q.unit!=='%'||v<100))values.add(v);if(values.size===4)break;} q.choices=[...values];for(let i=q.choices.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[q.choices[i],q.choices[j]]=[q.choices[j],q.choices[i]];}}
 return q;
}
export function display(value,unit) {return unit==='choice'?value:unit==='$M'?money(value):unit==='$'?`$${fmt(value)}`:`${fmt(value)}%`;}
export function correct(q,input) {return q.unit==='choice'?input===q.answer:input!==''&&Number.isFinite(Number(input))&&Math.abs(Number(input)-q.answer)<.011;}
export function chooseTopic(stats={},rng=Math.random) {const bag=Object.keys(topics).flatMap(k=>Array(stats[k]?.total?Math.max(1,Math.round(5*(1-stats[k].correct/stats[k].total))):3).fill(k)); return pick(bag,rng);}
