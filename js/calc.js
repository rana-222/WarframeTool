// ============================================================
// Warframe 裂罅计算器 - 计算逻辑
// ============================================================

// ============ 初始化 Combobox ============
function initComboboxes(){
    // 正向面板
    createCombobox("statInputF","dropdownF","statValueF", statOptions, false, true);
    createCombobox("weaponInputF","weaponDropdownF","weaponValueF", weaponOptions, false, true);
    createCombobox("propInputF","propDropdownF","propValueF", propOptions, false, false, (opt)=>{
        document.getElementById("customPropForward").style.display = opt.value==="custom"?"block":"none";
    });

    // 反向面板
    createCombobox("statInputR","dropdownR","statValueR", statOptions, false, true);
    createCombobox("weaponInputR","weaponDropdownR","weaponValueR", weaponOptions, false, true);
    createCombobox("riftLvInputR","riftLvDropdownR","riftLvValueR", riftLvOptions, true, false);
    createCombobox("propInputR","propDropdownR","propValueR", propOptions, false, false, (opt)=>{
        document.getElementById("customPropReverse").style.display = opt.value==="custom"?"block":"none";
    });

    // 移除默认选中值
    document.getElementById("propInputF").value = "";
    document.getElementById("propValueF").value = "";
    delete document.getElementById("propInputF").dataset.opt;

    document.getElementById("propInputR").value = "";
    document.getElementById("propValueR").value = "";
    delete document.getElementById("propInputR").dataset.opt;

    document.getElementById("riftLvInputR").value = "";
    document.getElementById("riftLvValueR").value = "";
    delete document.getElementById("riftLvInputR").dataset.opt;
}

function switchMode(){
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if(mode === 'forward'){
        document.getElementById('forwardPanel').style.display = "block";
        document.getElementById('reversePanel').style.display = "none";
    }else{
        document.getElementById('forwardPanel').style.display = "none";
        document.getElementById('reversePanel').style.display = "block";
    }
}

// 读取组合修正系数
function getPropValue(isReverse, isNegativeStat){
    let inputId = isReverse ? "propInputR" : "propInputF";
    const optRaw = document.getElementById(inputId).dataset.opt;
    if(!optRaw) return NaN;
    const opt = JSON.parse(optRaw);
    if(opt.value === 'custom'){
        if(isReverse){
            return Number(document.getElementById('propCoefR').value);
        }else{
            return Number(document.getElementById('propCoef').value);
        }
    }
    return isNegativeStat ? opt.negValue : Number(opt.value);
}

// 读取基础数值
function getBaseValue(isReverse){
    let statKey,weaponKey;
    if(!isReverse){
        statKey = document.getElementById("statValueF").value;
        weaponKey = document.getElementById("weaponValueF").value;
    }else{
        statKey = document.getElementById("statValueR").value;
        weaponKey = document.getElementById("weaponValueR").value;
    }
    if(!statKey || !weaponKey) return null;
    if(!Object.prototype.hasOwnProperty.call(baseTable, statKey)) return null;
    if(!Object.prototype.hasOwnProperty.call(baseTable[statKey], weaponKey)) return null;
    return baseTable[statKey][weaponKey];
}

// 渲染结果
function showResult(html){
    const el = document.getElementById("result");
    el.innerHTML = html;
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
}
function showWarn(msg){
    showResult(`<div class="warnbox">${msg}</div>`);
}

function calc(){
    const mode = document.querySelector('input[name="mode"]:checked').value;
    if(mode === "forward"){
        const base = getBaseValue(false);
        if(base === null){ showWarn("⚠️ 请先选择有效的词条、武器类型（请从下拉列表中选择）"); return; }
        if(!base){ showWarn("⚠️ 当前词条不支持该武器类型，请更换词条/武器"); return; }
        const prop = getPropValue(false, false);
        const propOptRaw = document.getElementById("propInputF").dataset.opt;
        if(!propOptRaw){ showWarn("⚠️ 请选择属性组合修正系数"); return; }
        const propOpt = JSON.parse(propOptRaw);
        if(propOpt.value === "custom"){
            if(isNaN(prop) || prop < customPropMin){
                showWarn(`⚠️ 请输入有效的自定义属性系数（需 ≥ ${customPropMin}）`); return;
            }
        }
        const rift = Number(document.getElementById("riftCoef").value);
        if(isNaN(rift) || rift < riftCoefMin || rift > riftCoefMax){
            showWarn(`⚠️ 裂罅倾向系数需在 ${riftCoefMin} ~ ${riftCoefMax} 之间`); return;
        }
        const float = Number(document.getElementById("floatCoef").value);
        if(isNaN(float) || float < floatMin || float > floatMax){
            showWarn(`⚠️ 浮动系数需在 ${floatMin} ~ ${floatMax} 之间`); return;
        }
        const riftFloatMul = rift * float;
        const finalVal = base * prop * riftFloatMul;
        showResult(`
            <div class="result-chip green">正向计算结果</div>
            <div class="result-row"><span class="k">基础数值</span><span class="v">${base}</span></div>
            <div class="result-row"><span class="k">裂罅倾向 × 浮动系数</span><span class="v">${riftFloatMul.toFixed(4)}</span></div>
            <div class="result-row"><span class="k">最终词条数值</span><span class="v">${finalVal.toFixed(4)}</span></div>`);
    }else{
        const finalInput = Number(document.getElementById("finalVal").value);
        if(isNaN(finalInput) || finalInput < 0){
            showWarn("⚠️ 最终词条数值需为非负数"); return;
        }
        const isNeg = document.querySelector('input[name="statTypeR"]:checked').value === "negative";
        const final = isNeg ? -Math.abs(finalInput) : finalInput;

        const base = getBaseValue(true);
        if(base === null){ showWarn("⚠️ 请先选择有效的词条、武器、裂罅等级（请从下拉列表中选择）"); return; }
        if(!base){ showWarn("⚠️ 当前词条不支持该武器类型，请更换词条/武器"); return; }
        const prop = getPropValue(true, isNeg);
        const propOptRawR = document.getElementById("propInputR").dataset.opt;
        if(!propOptRawR){ showWarn("⚠️ 请选择属性组合修正系数"); return; }
        const propOptR = JSON.parse(propOptRawR);
        if(propOptR.value === "custom"){
            if(isNaN(prop) || prop < customPropMin){
                showWarn(`⚠️ 请输入有效的自定义属性系数（需 ≥ ${customPropMin}）`); return;
            }
        }
        const riftLv = Number(document.getElementById("riftLvValueR").value);
        if(!riftLv){ showWarn("⚠️ 请选择裂罅等级"); return; }

        const product = final / (base * prop);
        const riftInfo = riftLevelList.find(x=>x.lv === riftLv);
        const productMin = riftInfo.min * floatMin;
        const productMax = riftInfo.max * floatMax;
        const outOfRange = product < productMin || product > productMax;

        let percent;
        if(productMax === productMin){
            percent = 50;
        }else{
            percent = (product - productMin) / (productMax - productMin) * 100;
        }

        let rankText, rankClass;
        if(percent <= 20){ rankText = "评级：很低（低分词条）"; rankClass = 1; }
        else if(percent <= 40){ rankText = "评级：偏低"; rankClass = 2; }
        else if(percent <= 60){ rankText = "评级：中等"; rankClass = 3; }
        else if(percent <= 80){ rankText = "评级：偏高"; rankClass = 4; }
        else{ rankText = "评级：很高（极品词条）"; rankClass = 5; }

        const statTypeName = isNeg ? "负面词条" : "正向词条";
        const barPercent = Math.max(0, Math.min(100, percent));
        showResult(`
            <div class="result-chip">反向计算结果 · ${statTypeName}</div>
            <div class="result-row"><span class="k">基础数值</span><span class="v">${base}</span></div>
            <div class="result-row"><span class="k">选定裂罅等级</span><span class="v">Lv.${riftLv}</span></div>
            <div class="result-row"><span class="k">武器倾向范围</span><span class="v">${riftInfo.min} ~ ${riftInfo.max}</span></div>
            <div class="result-row"><span class="k">裂罅倾向 × 浮动系数</span><span class="v">${product.toFixed(4)}</span></div>
            <div class="result-row"><span class="k">本等级乘积理论区间</span><span class="v">${productMin.toFixed(4)} ~ ${productMax.toFixed(4)}</span></div>
            <div class="percent-bar"><div class="percent-fill ${outOfRange ? "bad" : ""}" style="width:${barPercent.toFixed(2)}%"></div></div>
            <div class="result-row"><span class="k">该数值在本等级内百分比</span><span class="v">${percent.toFixed(2)} %</span></div>
            <div><span class="rank-chip rank-${rankClass}">${rankText}</span></div>
            ${outOfRange ? `<div class="warnbox">⚠️ 警告：该乘积超出本等级理论区间！该数值组合现实不存在！</div>` : ""}`);
    }
}
