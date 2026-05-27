# QML 声明式编程：理论背景与心智模型

> 这份笔记整理自一次围绕 KDE Plasma、QML、`FolderItemDelegate.qml` 的调试讨论。目标不是背语法，而是帮助有命令式编程背景的程序员建立正确的阅读模型。

---

## 0. 一句话总览

QML 不应该主要被理解为“从上到下执行的脚本”，而应该被理解为：

```text
对象树 + 属性依赖图 + 响应式更新 + 模板实例化 + 事件回调
```

更短地说：

```text
QML = 用声明式方式描述 UI 结构和状态关系。
```

---

## 1. 理论一：声明式编程 Declarative Programming

命令式编程关注：

```text
一步一步怎么做。
```

声明式编程关注：

```text
最终关系是什么。
```

例如，让一个矩形始终保持父对象宽度的一半。命令式写法可能是：

```js
box.width = parent.width / 2

parent.onResize = function () {
    box.width = parent.width / 2
}
```

QML 声明式写法是：

```qml
Rectangle {
    id: box
    width: parent.width / 2
}
```

这句不是“执行一次赋值”，而是声明：

```text
box.width 与 parent.width 之间存在长期关系。
```

---

## 2. 理论二：属性绑定系统 Property Binding System

QML 中的：

```qml
width: parent.width / 2
```

通常是绑定，不是一次性赋值。

它类似 Excel 公式：

```text
A3 = A1 + A2
```

当 A1 或 A2 变化时，A3 自动变化。

条件表达式也仍然是绑定：

```qml
Rectangle {
    id: box
    property bool fixedWidth: false

    width: fixedWidth ? 300 : parent.width / 2
}
```

这表示：

```text
width 绑定到整个表达式：fixedWidth ? 300 : parent.width / 2
```

如果 `fixedWidth` 为 true，`width` 是 300；如果 `fixedWidth` 为 false，`width` 又回到 `parent.width / 2`。

需要注意：事件里直接写：

```qml
box.width = 300
```

会覆盖原来的绑定。类比 Excel，就是把原来的公式 `=A1/2` 手动改成了固定值 `300`。

---

## 3. 理论三：数据流编程 Dataflow Programming

QML 属性之间会形成依赖图。

```qml
Rectangle {
    id: root
    width: 800

    Rectangle {
        id: box
        width: root.width / 2
    }

    Text {
        text: "box width = " + box.width
    }
}
```

脑内模型不是“从上到下执行”，而是：

```text
root.width
   ↓
box.width
   ↓
Text.text
```

阅读 QML 时，应该经常问：

```text
谁依赖谁？
谁变化会推动谁重新计算？
这个属性是源头，还是推导结果？
```

---

## 4. 理论四：响应式编程 Reactive Programming

QML 的属性绑定天然带有响应式编程思想：

```text
状态变化 -> 依赖该状态的 UI 自动变化
```

例如：

```qml
Rectangle {
    id: button

    property bool hovered: false

    color: hovered ? "blue" : "gray"

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true

        onEntered: button.hovered = true
        onExited: button.hovered = false
    }
}
```

事件处理器本身不直接负责显示；它只改变状态。真正决定颜色的是：

```qml
color: hovered ? "blue" : "gray"
```

完整链路是：

```text
鼠标进入/离开
    ↓
hovered 状态变化
    ↓
color 绑定重新计算
    ↓
界面颜色变化
```

---

## 5. 理论五：Single Source of Truth，单一事实来源

不推荐：

```qml
Label {
    id: label
    text: model.display
}

onContainsMouseChanged: {
    label.text = "wanghq" + model.display
}
```

因为 `label.text` 原本由 `model.display` 推导出来，你又在事件里手动改 `label.text`，等于让多个地方维护同一个结果。

更推荐：

```qml
property bool debugPrefix: false

Label {
    id: label
    text: debugPrefix ? "wanghq" + model.display : model.display
}

onContainsMouseChanged: {
    debugPrefix = containsMouse
}
```

这里的事实来源是：

```text
debugPrefix
model.display
```

`label.text` 是推导结果。

核心心智模型是：

```text
UI = f(state, data)
```

界面是状态和数据的函数。

---

## 6. 理论六：组件化 UI Component-Based UI

QML 文件声明的是对象树。

```qml
Rectangle {
    width: 200
    height: 100
    color: "lightgray"

    Text {
        text: "hello"
        anchors.centerIn: parent
    }
}
```

对象树是：

```text
Rectangle
  └── Text
```

这不是“执行一个 Text 代码块”，而是在 Rectangle 里面创建一个 Text 子对象。

对象也可以作为属性值传递：

```qml
ToolTipArea {
    mainItem: minimalToolTip

    Label {
        id: minimalToolTip
        text: "hello"
    }
}
```

这里：

```qml
mainItem: minimalToolTip
```

表示：

```text
ToolTipArea.mainItem 指向 minimalToolTip 这个 Label 对象。
```

不是把文字复制过去。

---

## 7. 理论七：Model-View-Delegate

Model-View-Delegate 可以这样理解：

```text
Model    = 数据
View     = 数据如何排列
Delegate = 每一项数据如何显示/编辑
```

简单例子：

```qml
ListView {
    model: ["A", "B", "C"]

    delegate: Text {
        text: modelData
    }
}
```

脑内模型：

```text
model 有 3 条数据；
delegate 是每一项的模板；
ListView 根据 delegate 创建 3 个 Text 实体。
```

运行时类似：

```qml
Text { text: "A" }
Text { text: "B" }
Text { text: "C" }
```

对应到 Plasma 桌面图标：

```text
Model
    桌面文件列表，每个文件项有 display、blank、size、type 等数据角色

View
    FolderView / GridView，负责把文件排列成桌面图标网格

Delegate
    FolderItemDelegate.qml，负责每个图标怎么显示、hover 怎么处理、tooltip 怎么显示
```

所以：

```qml
text: model.display
```

表示：

```text
当前这个 delegate 实例对应的数据项，其 display 字段作为文本显示。
```

---

## 8. 理论八：MVC、MVVM 与 Model-View-Delegate 的关系

MVC 的核心动机是：

```text
把数据、显示、用户操作分离。
```

即：

```text
Model      负责数据
View       负责显示
Controller 负责用户输入和操作协调
```

Qt/QML 的 Model-View-Delegate 可以看成 MVC 思想的一种工程化变体：

```text
Model    数据
View     排列和滚动
Delegate 单项显示与交互模板
```

MVVM 的核心思想是：

```text
View 绑定到 ViewModel 暴露的数据和状态；
状态变化时，View 自动更新。
```

QML 的属性绑定与 MVVM 很接近。学习 QML 时，可以借用 MVVM 的思路：

```text
不要手动到处改 UI；
把 UI 属性绑定到状态；
事件只负责改变状态。
```

---

## 9. 模板与实体：Component、Loader、Delegate

类型名不是实体：

```qml
Text
Rectangle
ListView
PlasmaCore.ToolTipArea
PlasmaComponents.Label
```

这些更像类或构造器。

`{ ... }` 通常创建实体：

```qml
Rectangle {
    id: box
    width: 100
    height: 50
}
```

这里 `box` 指向一个具体的 Rectangle 实体。

`Component` 是显式模板：

```qml
Component {
    id: redBoxTemplate

    Rectangle {
        width: 100
        height: 100
        color: "red"
    }
}
```

这里 `redBoxTemplate` 是模板，不是屏幕上的红色矩形实体。

通过 Loader 才创建实体：

```qml
Loader {
    id: loader
    sourceComponent: redBoxTemplate
}
```

含义是：

```text
loader 是 Loader 实体；
loader.sourceComponent 指向 redBoxTemplate 模板；
loader.item 是根据模板创建出来的 Rectangle 实体。
```

`sourceComponent` 和 `mainItem` 的区别：

```text
sourceComponent: redBoxTemplate
    Component 属性 ← Component 模板

mainItem: minimalToolTip
    Item 属性 ← Item 实体
```

---

## 10. QML 中哪些名字来自哪里

可以分成四层：

### 10.1 QML 语言机制

```text
id
property
signal
function
属性名: 表达式
onXXXChanged
Component.onCompleted
```

### 10.2 Qt Quick 类型

通常来自：

```qml
import QtQuick 2.x
```

常见：

```text
Item
Rectangle
Text
TextInput
MouseArea
ListView
GridView
Loader
Component
anchors
parent
```

### 10.3 KDE Plasma 类型

通常来自：

```qml
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.components as PlasmaComponents
```

常见：

```text
PlasmaCore.ToolTipArea
PlasmaComponents.Label
PlasmaCore.Types.LeftEdge
plasmoid
```

### 10.4 当前文件或业务代码定义的名字

例如 `FolderItemDelegate.qml` 中：

```text
main
label
icon
toolTip
minimalToolTip
popupDialog
```

这些通常是文件作者用 `id` 或 `property` 定义的局部名字。

---

## 11. 结合 `FolderItemDelegate.qml` 的例子

典型片段：

```qml
PlasmaCore.ToolTipArea {
    id: toolTip

    active: plasmoid.configuration.toolTips && label.truncated && popupDialog === null
    interactive: false
    mainItem: minimalToolTip

    onContainsMouseChanged: {
        if (containsMouse && !model.blank) {
            main.GridView.view.hoveredItem = main
        }
    }

    PlasmaComponents.Label {
        id: minimalToolTip
        text: model.display
        textFormat: Text.PlainText
        wrapMode: Text.NoWrap
        elide: Text.ElideNone
    }
}
```

可以翻译成：

```text
创建一个 PlasmaCore.ToolTipArea 实体，名字叫 toolTip。

active 绑定到：
plasmoid.configuration.toolTips && label.truncated && popupDialog === null。

mainItem 指向 minimalToolTip 这个 Label 实体。

创建一个 Label 实体，名字叫 minimalToolTip。

minimalToolTip.text 绑定到当前文件项的 model.display。

containsMouse 变化时，执行 onContainsMouseChanged 里的 JS。
```

如果想加调试前缀，不推荐直接写：

```qml
minimalToolTip.text = "wanghq" + model.display
```

更推荐：

```qml
property bool debugPrefix: false

PlasmaComponents.Label {
    id: minimalToolTip
    text: debugPrefix ? "wanghq" + model.display : model.display
}

onContainsMouseChanged: {
    debugPrefix = containsMouse
}
```

原因是：

```text
事件里只修改 debugPrefix 状态；
text 继续由绑定表达式统一推导；
不会破坏 text 的绑定关系。
```

---

## 12. 阅读 QML 的五类判断法

看到一行 QML，先判断它属于哪一类：

```text
1. 对象声明：Label { id: title }
2. 属性绑定：text: model.display
3. 对象引用：mainItem: minimalToolTip
4. 事件处理器：onContainsMouseChanged: { ... }
5. 模板：delegate: Text { text: modelData }
```

这些类别的含义分别是：

```text
对象声明：创建对象实体。
属性绑定：建立长期依赖关系。
对象引用：某个属性指向另一个对象。
事件处理器：某个变化发生时执行 JS。
模板：View/Loader 后续用它创建实体。
```

---

## 13. 最终心智模型清单

```text
1. QML 文件声明对象树，不是普通顺序脚本。
2. id 是当前作用域内的对象名，不是字符串。
3. 属性: 表达式 通常是绑定，不是一次性赋值。
4. 命令式赋值会覆盖绑定，所以尽量修改状态，不直接修改 UI 结果。
5. Component 和 delegate 是模板，Loader/View 根据模板创建实体。
6. Model-View-Delegate 中，model 是数据，view 是排列，delegate 是每项显示模板。
7. UI 应该被理解成状态和数据的函数：UI = f(state, data)。
8. 阅读 QML 时，不要只问“执行到哪一行”，要问“谁依赖谁”。
```

一句话总结：

```text
QML 的核心不是“执行代码改变界面”，而是“声明数据、状态、对象之间的关系，让框架在变化时自动更新界面”。
```
