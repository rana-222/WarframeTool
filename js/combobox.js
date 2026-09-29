// ============================================================
// 通用 Combobox 下拉搜索组件
// ============================================================

function highlightText(text, keyword){
    if(!keyword.trim()) return text;
    const reg = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,"gi");
    return text.replace(reg,`<span class="keyword-highlight">$1</span>`);
}

/**
 * 创建下拉搜索框
 * @param {string} inputId 输入框ID
 * @param {string} dropdownId 下拉容器ID
 * @param {string} hiddenId 隐藏值ID
 * @param {Array} optList 选项列表 [{label,value,...}]
 * @param {boolean} allowHtml 是否允许label中的HTML
 * @param {boolean} enableSearch 是否开启搜索过滤
 * @param {Function} onSelect 选中回调
 */
function createCombobox(inputId, dropdownId, hiddenId, optList, allowHtml=false, enableSearch=true, onSelect=null){
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const hidden = document.getElementById(hiddenId);
    dropdown.setAttribute("role","listbox");

    function render(keyword=""){
        let list;
        if(enableSearch && keyword){
            list = optList.filter(o=>o.label.replace(/<[^>]+>/g,"").toLowerCase().includes(keyword.toLowerCase()));
        }else{
            list = optList;
        }
        dropdown.innerHTML = "";
        if(list.length===0){
            dropdown.innerHTML = `<div class="combobox-item">无匹配</div>`;
        }else{
            list.forEach(opt=>{
                const div = document.createElement("button");
                div.type = "button";
                div.className="combobox-item";
                div.setAttribute("role","option");
                const plainText = opt.label.replace(/<[^>]+>/g,"");
                if(allowHtml){
                    div.innerHTML = (enableSearch && keyword) ? highlightText(plainText, keyword) : opt.label;
                }else{
                    div.innerHTML = enableSearch ? highlightText(opt.label, keyword) : opt.label;
                }
                div.onclick = ()=>{
                    input.value = plainText;
                    hidden.value = opt.value;
                    input.dataset.opt = JSON.stringify(opt);
                    dropdown.style.display="none";
                    if(typeof onSelect === "function") onSelect(opt);
                };
                dropdown.appendChild(div);
            })
        }
        dropdown.style.display="block";
    }

    function close(){
        dropdown.style.display="none";
    }

    if(enableSearch){
        input.addEventListener("focus",()=>render(input.value));
        // 用户手动输入时清除已选中的缓存值，避免依据前一次选中的有效项输出
        input.addEventListener("input",()=>{
            hidden.value = "";
            delete input.dataset.opt;
            render(input.value);
        });
    }else{
        input.addEventListener("click",()=>render(""));
    }

    document.addEventListener("click",(e)=>{
        if(!input.parentElement.contains(e.target)) close();
    });
}
