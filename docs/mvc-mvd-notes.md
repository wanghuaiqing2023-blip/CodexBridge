# MVC 与 MVD：从抽象概念到具体例子

这份笔记整理了我们关于 MVC、Controller、MVD 以及 Delegate 的讨论。重点不是背概念，而是通过具体例子理解这些架构思想为什么会出现、它们分别解决什么问题，以及在真实代码组织中应该怎样理解它们。

> 说明：这里的 **MVD** 按常见 GUI 框架中的 **Model–View–Delegate** 理解。它不像 MVC、MVP、MVVM 那样在所有领域都有高度统一的叫法，但在 Qt 等 Model/View 架构中很常见。

---

## 1. MVC 是什么？

MVC 是 **Model–View–Controller** 的缩写。

它把一个应用中经常混在一起的三类职责分开：

```text
Model      负责数据和业务逻辑
View       负责界面展示
Controller 负责接收用户输入，并协调 Model 和 View
```

一个典型 Web MVC 流程如下：

```text
用户发起请求
    ↓
Controller 接收请求
    ↓
Controller 调用 Model 处理业务
    ↓
Model 返回数据或处理结果
    ↓
Controller 选择合适的 View
    ↓
View 渲染页面
    ↓
返回给用户
```

例如用户访问：

```text
GET /users/123
```

可能对应这样的流程：

```text
UserController 接收请求
    ↓
UserModel 查询 id = 123 的用户数据
    ↓
UserController 把用户数据交给 user_detail.html
    ↓
View 渲染用户详情页
```

---

## 2. MVC 的设计动机

MVC 的核心动机是：

> **把数据、展示、交互流程分开，降低耦合，提高可维护性。**

如果没有 MVC，代码很容易写成这样：

```text
页面展示代码
数据库查询代码
业务判断代码
用户输入处理代码
全部混在一起
```

这样会带来很多问题：

```text
页面一改，业务逻辑可能被影响
数据库逻辑一改，界面代码也可能被影响
代码越来越难读
多人协作容易冲突
测试困难
复用困难
```

MVC 的分层可以让不同职责相对独立：

```text
Model      管业务和数据
View       管展示
Controller 管请求和流程调度
```

因此，当页面改版时，主要改 View；当业务规则变化时，主要改 Model；当请求流程变化时，主要改 Controller。

---

## 3. Controller 是只有一个吗？

不是。

在实际项目中，Controller 通常不是全项目只有一个，也不一定是一个 View 对应一个 Controller。

更常见的划分方式是：

> **一个 Controller 负责一类业务请求或一组相关功能。**

例如一个后台管理系统可能有：

```text
UserController        处理用户相关请求
ProductController     处理商品相关请求
OrderController       处理订单相关请求
AuthController        处理登录、注册、退出等认证请求
```

### 3.1 一个 Controller 可以对应多个 View

例如 `UserController` 可能处理：

```text
GET /users             用户列表页
GET /users/123         用户详情页
GET /users/123/edit    用户编辑页
```

它可能返回多个不同 View：

```text
user_list.html
user_detail.html
user_edit.html
```

所以常见关系是：

```text
一个 Controller → 多个 View
```

### 3.2 多个 Controller 也可以复用同一个 View

例如通用错误页：

```text
error.html
```

可能被很多 Controller 使用：

```text
UserController
OrderController
ProductController
```

所以也可能是：

```text
多个 Controller → 同一个 View
```

### 3.3 Controller 的合理划分原则

不要问：

> 这个 View 要不要配一个 Controller？

更应该问：

> 这些请求是否属于同一类业务职责？

如果都围绕“文章”，可以放在 `ArticleController`；如果都围绕“订单”，可以放在 `OrderController`。但如果一个 Controller 里塞了登录、商品、订单、支付、文件上传等所有逻辑，它就变成了臃肿的 Controller，需要拆分。

---

## 4. MVC 是设计模式吗？

可以说是，但更严谨地说，MVC 是一种 **架构模式**，或者说是 **表现层架构模式**。

原因是：

```text
普通设计模式：通常解决几个类之间如何协作的问题
架构模式：通常解决整个应用如何组织的问题
MVC：解决应用中数据、界面、交互流程如何组织的问题
```

例如：

```text
工厂模式：关注对象如何创建
策略模式：关注算法如何替换
观察者模式：关注对象之间如何通知
MVC：关注应用整体如何拆分为 Model、View、Controller
```

所以在日常交流中说 “MVC 是一种设计模式” 没问题；在更严谨的语境下，最好说：

> **MVC 是一种常见的软件架构模式，也常被称为设计模式。**

---

## 5. MVD 是什么？

这里的 MVD 指 **Model–View–Delegate**。

它和 MVC 属于同一类思想：都试图把数据和界面分开。

但它的角色不同：

```text
Model     负责数据
View      负责整体显示结构
Delegate  负责具体数据项怎么显示、怎么编辑
```

MVD 常见于表格、列表、树形控件这种场景。

例如：

```text
TableView
ListView
TreeView
```

这类 UI 有一个特点：它们不是只有一个页面，而是有大量重复的数据项。

比如一个商品表格：

```text
商品名        价格        库存        是否上架
-----------------------------------------
键盘          ¥199.00     库存 20     ☑
鼠标          ¥59.00      缺货        ☐
显示器        ¥899.00     库存 5      ☑
```

这里每一列的显示和编辑规则都不一样：

```text
商品名：普通文本
价格：金额格式 + 数字输入框
库存：0 显示为“缺货” + 整数输入框
是否上架：checkbox
```

如果把这些逻辑都塞进 View，View 会变得复杂；如果都塞进 Controller，Controller 也会很臃肿。

所以 MVD 引入 Delegate，把“某个数据项怎么显示、怎么编辑”这类细节单独抽出来。

---

## 6. Delegate 到底是什么意思？

Delegate 可以理解为：

> **被 View 委托去处理具体显示和编辑工作的对象。**

也就是说，View 自己不亲自处理每个单元格怎么画、怎么编辑，而是把这些细节交给 Delegate。

可以这样理解：

```text
View：我负责表格整体结构，比如有几行几列、滚动条、选中状态。
Delegate：具体某个格子怎么显示、怎么编辑，我来处理。
```

例如价格列的原始数据是：

```text
59
```

界面上要显示成：

```text
¥59.00
```

这件事可以交给 `PriceDelegate`。

`PriceDelegate` 负责：

```text
把 59 显示成 ¥59.00
编辑时使用数字输入框
限制输入不能小于 0
保存时把用户输入转换回数字
```

所以：

```text
PriceDelegate = 价格列的显示规则 + 编辑规则
```

再比如 `CheckboxDelegate`：

```text
Model 中保存 true / false
View 中显示 ☑ / ☐
用户点击后在 true 和 false 之间切换
```

所以：

```text
CheckboxDelegate = 布尔值和 checkbox 之间的显示、编辑、转换规则
```

---

## 7. 用商品表格具体理解 MVD

假设 Model 中保存的数据是：

```js
const products = [
  { name: "键盘", price: 199, stock: 20, online: true },
  { name: "鼠标", price: 59, stock: 0, online: false },
  { name: "显示器", price: 899, stock: 5, online: true }
];
```

Model 只关心原始数据：

```text
price 是 199、59、899
stock 是 20、0、5
online 是 true、false、true
```

Model 不关心这些问题：

```text
价格前面要不要加 ¥
库存为 0 时要不要显示“缺货”
online 要显示成 true/false 还是 checkbox
```

这些展示和编辑细节由 Delegate 负责。

### 7.1 PriceDelegate

`PriceDelegate` 负责价格列：

```js
function displayPrice(value) {
  return "¥" + value.toFixed(2);
}
```

它把 Model 中的：

```text
59
```

显示成：

```text
¥59.00
```

编辑时，它可以要求：

```text
只能输入数字
不能小于 0
保留两位小数
```

### 7.2 StockDelegate

`StockDelegate` 负责库存列：

```js
function displayStock(value) {
  if (value === 0) {
    return "缺货";
  }
  return "库存 " + value;
}
```

它把 Model 中的：

```text
0
```

显示成：

```text
缺货
```

把：

```text
20
```

显示成：

```text
库存 20
```

### 7.3 CheckboxDelegate

`CheckboxDelegate` 负责是否上架列：

```text
true  → ☑
false → ☐
```

用户点击时，它负责把数据切换为：

```text
true  → false
false → true
```

---

## 8. MVD 的完整流程例子

以“用户把鼠标价格从 59 改成 69”为例。

原始数据：

```js
{ name: "鼠标", price: 59, stock: 0, online: false }
```

操作流程：

```text
用户双击“价格”单元格
    ↓
TableView 知道用户点了第 2 行、第 2 列
    ↓
TableView 找到这一列对应的 PriceDelegate
    ↓
PriceDelegate 创建数字输入框
    ↓
用户输入 69
    ↓
PriceDelegate 检查输入是否合法
    ↓
PriceDelegate 把 69 写回 ProductModel
    ↓
ProductModel 更新 price
    ↓
TableView 重新显示这一格
    ↓
PriceDelegate 把 69 显示成 ¥69.00
```

最终界面变成：

```text
鼠标          ¥69.00      缺货        ☐
```

这里的关键分工是：

```text
ProductModel  只保存原始数据 69
TableView     负责表格整体结构
PriceDelegate 负责价格这一格怎么显示和编辑
```

---

## 9. 如果用 MVC，会怎么做？

在普通 MVC 中，可能有：

```text
ProductModel
ProductView
ProductController
```

用户修改价格时，流程可能是：

```text
用户输入 69
    ↓
ProductController 接收事件
    ↓
ProductController 校验价格
    ↓
ProductController 修改 ProductModel
    ↓
ProductController 通知 ProductView 刷新
```

在 MVC 中，Controller 往往承担更多“用户操作怎么处理”的责任。

但在复杂表格中，如果所有列的编辑逻辑都放进 Controller，就可能变成：

```text
价格怎么校验
库存怎么校验
checkbox 怎么转换
日期怎么编辑
图片怎么显示
分类下拉框怎么处理
```

全部堆在一个 Controller 里。

这就是 MVD 引入 Delegate 的动机：

> **把每个数据项或每一列的显示、编辑细节交给专门的 Delegate，而不是塞进一个巨大的 Controller 或 View。**

---

## 10. MVC 与 MVD 的关系

可以把 MVD 看成 MVC 思想在某些 GUI 场景下的变体。

粗略对应关系如下：

| MVC | MVD | 说明 |
| --- | --- | --- |
| Model | Model | 都负责数据和业务状态 |
| View | View | 都负责展示 |
| Controller | View + Delegate | Controller 的一部分职责被 View 和 Delegate 分担 |
| 无 | Delegate | MVD 新增，负责具体数据项的显示和编辑 |

也可以这样理解：

```text
MVC = Model + View + Controller

MVD = Model + View + Delegate
    ≈ Model + 合并部分控制能力的 View + 专门处理数据项显示/编辑的 Delegate
```

---

## 11. MVC 和 MVD 的适用场景差异

### MVC 更像页面级架构

MVC 适合描述：

```text
一个页面如何响应用户请求
一个业务模块如何组织请求、数据、视图
Web 应用中的路由、Controller、模板渲染关系
```

例如：

```text
ArticleController 管文章列表、详情、新建、编辑、删除
UserController 管用户列表、详情、编辑
OrderController 管订单创建、支付、取消
```

### MVD 更像复杂数据控件架构

MVD 适合描述：

```text
表格中每一列怎么显示和编辑
列表中每一项怎么渲染
树形结构中每个节点怎么展示
不同数据类型如何映射到不同 UI 控件
```

例如：

```text
PriceDelegate     负责价格列
StockDelegate     负责库存列
CheckboxDelegate  负责是否上架列
DateDelegate      负责日期列
ImageDelegate     负责图片列
```

---

## 12. 一个通俗类比

MVC 像这样：

```text
Model：仓库数据
View：商品页面
Controller：店长，负责协调用户操作和业务流程
```

MVD 像这样：

```text
Model：仓库数据
View：货架
Delegate：每种商品标签的显示和编辑规则
```

例如：

```text
价格标签 Delegate：负责价格怎么显示、怎么修改
库存标签 Delegate：负责库存怎么显示、怎么修改
上下架 Delegate：负责 checkbox 怎么显示、怎么切换
```

---

## 13. 最重要的结论

### MVC 的核心

```text
Model      做业务和数据
View       做展示
Controller 做流程调度
```

MVC 的重点是：

> **分离业务数据、界面展示和用户交互流程。**

### Controller 的理解

```text
Controller 不是全项目只有一个
也不一定一个 View 一个 Controller
更常见的是一个 Controller 管一类业务请求
一个 Controller 可以返回多个 View
多个 Controller 也可以复用同一个 View
```

### MVD 的核心

```text
Model     保存数据
View      显示整体结构
Delegate  处理具体数据项怎么显示、怎么编辑
```

MVD 的重点是：

> **在复杂数据视图中，把每个数据项的显示和编辑规则抽出来交给 Delegate。**

### Delegate 的一句话理解

> **Delegate 就是 View 请来帮忙处理“某个格子、某一列、某个数据项该怎么显示和编辑”的对象。**

---

## 14. 最终记忆版

```text
MVC 更关注：一个页面或业务流程如何组织。
MVD 更关注：一个复杂数据控件中的数据项如何展示和编辑。
```

或者更短：

```text
MVC：Model + View + Controller
MVD：Model + View + Delegate

Controller 管流程。
Delegate 管具体数据项的显示和编辑。
```
