# Craftlove

A simple build system for Löve2D that includes additional compilation features. This project is **heavily** inspired by [makelove](https://github.com/pfirsich/makelove).

# Motivation

There were two main reasons for me to do this:

First and foremost: I could have just used makelove hooks instead of writing almost the same system again, but here's the thing: **I hate python**. I don't have a python interpreter on my machine nor I want to install one. I don't like waiting a few seconds for the interpreter to kick in plus the language design of Python is not of my liking.

The second reason is that I really missed "conditional compilation" in Lua. I'm used to work with C,C++,C# and all of them have directives to make platform dependand code and such. I wanted to use assertions and add some special checks to make sure the game works fine during development. But I didn't want that in my build. Most people use a global bool and if-else to workaround that, but we are talking about games, we can't just have a bunch of useless if conditions in release that might affect game performance. Even if Love2D uses Luajit, it's still slow compared to other languages. If someone wants a bullet hell or something where optimizing every performance drop of the update cycle matter, then that should be possible to do while still having assertions in debug. This system also allows engine builder to use code versioning, so depending on the version, different stuff might happen. Is it really all of this neccesary? Who knows, but now I sleep better at nights.

# Installation

Craftlove is a npm package, so the best way to use it is installing it globally

```
npm i craftlove -g
```

# Usage

This is a CLI tool in which the main functionality is defined in a `craftlove.toml` file that must be located in the source directory where craftlove is executed. The command format is as follows:

The `craftlove` command is a build system for Love2D projects. Its basic syntax is:

```bash
craftlove <path> <mode> [options]
```

## Arguments
- `<path>`: Path to the Love2D project directory.
- `<mode>`: Execution mode, can be either `build` (to build the project) or `run` (to build and run the project).

## Options
- `--version <version>`: Overrides the version defined in the project's configuration.
- `--release`: Enables release mode (RELEASE mode).
- `--debug`: Enables debug mode (DEBUG mode).
- `--set-var <variable>`: Defines a custom conditional compilation variable (can be specified multiple times). It only defines boolean flags.
- `--verbose`: Displays detailed informational messages.
- `--errors-only`: Displays only error messages.

## Configuration file

Same as with makelove, here you can define a `craftlove.toml` file in the root of your game directory to set many settings you can't set with the CLI. Check [craftlove_full.toml](./craftlove_full.toml) in order to see the arguments that are supported as of now and how they work

## Example Usage

```bash
craftlove run . --release --set-var TESTING --version 1.2.0
```

This example runs the project located in the current directory in release mode, defines the conditional variable `TESTING`, and overrides the version to `1.2.0`.

# Example

This repo includes a test folder with a main.lua and a craftlove.toml. This is the file:

```lua
function love.draw()
    local x, y = 200, 200
    local baseSize = 100

    if CRAFT_LOVE.DEBUG then
        love.graphics.setColor(1, 0, 0)
        if CRAFT_LOVE.VERSION > "1.0" then
            love.graphics.circle("fill", x, y, baseSize * 1.5)
        elseif CRAFT_LOVE.VERSION > "0.8" then
            love.graphics.rectangle("fill", x, y, baseSize * 1.2, baseSize * 1.2)
        else
            if CRAFT_LOVE.FEATURE_A then
                love.graphics.polygon("fill", x, y, x + baseSize, y, x + baseSize / 2, y + baseSize)
            else
                love.graphics.ellipse("fill", x, y, baseSize, baseSize / 2)
            end
        end
    else
        love.graphics.setColor(0, 1, 0)
        if CRAFT_LOVE.VERSION > "2.5" then
            love.graphics.circle("fill", x, y, baseSize)
        elseif CRAFT_LOVE.VERSION > "1.3" then
            love.graphics.rectangle("fill", x, y, baseSize, baseSize)
        else
            if CRAFT_LOVE.FEATURE_B then
                love.graphics.line(x, y, x + baseSize, y + baseSize)
            else
                love.graphics.points(x, y, x + baseSize, y, x + baseSize / 2, y + baseSize)
            end
        end
    end
end
```
If we make a release build (release by default) with FEATURE_A enabled and check the artifacts folder, we will get this:

```lua
_G.CRAFT_LOVE = {
  FEATURE_A = true,
  VERSION = 0.7,
  RELEASE = true,
}

function love.draw()
    local x, y = 200, 200
    local baseSize = 100

        love.graphics.setColor(0, 1, 0)
                love.graphics.points(x, y, x + baseSize, y, x + baseSize / 2, y + baseSize)



end
```

The first if block got completely removed because we're in release, in the second one, there is another if block, only the else is taken since the version set in the TOML is `"0.7"`. Also, ``FEATURE_A`` is defined but not ``FEATURE_B``, that's why the love.graphics.points line is taken.

# Conditional Compilation

This section explains both the philosophy and the usage more in depth. Skip the design philosophy if you only care about using it asap.

## Design philosophy

I tried to implement "conditional compilation" in a way that works fine even if you don't have craftlove. At first, I was just going to use commens like:

```lua
---#if DEBUG

---#endif
```

But that resulted in this gross pattern

```lua
_G.DEBUG = true

---#if DEBUG
if _G.DEBUEG then 
    -- stuff
end
---#endif

---#if not DEBUG
if not _G.DEBUEG then 
    -- stuff
end
---#endif
```

First, you were forced to define a extra variable, you couldn't use if-else with the comment system... Sure some of these can be fixed, but I didn't like it. Furthermore, everytime you want to test the game you're forced to copy and process all the lua files. JavaScript is not a super fast language, and my implementation is naive which doesn't help. Even if it wasn't, it would sure have an impact on medium scale projects even if most files don't use these features.

This issues also happens now in release mode, but you know, you shouldn't be using that for iterating and testing. One could think that "well maybe you can define a special hint comment like ---#no_conditional_compilation_hint that goes at the top of the files so that way they're not edited and saves time". But I don't want force the user to do stuff, even if this tool is mainly for me I want it as easy to use as possible. So in release mode every lua file is processed.

Now, returning to the design decision. I really didn't have much options. I first thought the comment thing because it was easy to parse, but then I had an idea: "What if I make some lua if statements specials?". And that's what I did. Every if statement that contains a "_G.CRAFTLOVE" or "CRAFTLOVE" string will be treated as a conditional compilation block. The system converts the expression to JS and executes it. It does some transformations for that:

1. **Global Variables**:  
   - `_G.CRAFT_LOVE.<variable>` → `env.<variable>`
   - `CRAFT_LOVE.<variable>` → `env.<variable>`

2. **Comparison Operators**:
   - `==` → `===`
   - `~=` → `!==`

3. **Logical Operators**:
   - `and` → `&&`
   - `or` → `||`
   - `not` → `!`

4. **Others**:
   - Any global access to `CRAFT_LOVE` or `_G.CRAFT_LOVE` maps to `env`.


This way the user can even use >, <= and any operator to not only distinc between debug and release but also between versions.

This system has its flaws, you have to use a CRAFT_LOVE global object that won't existe until using craftlove, which makes lua projects that uses this slightly dependand. Of course you can add the CRAFT_TABLE globala table yourself, but what I mean is that this is not a perfect solution. Also, as it uses normal if-else from lua, an external user won't be aware of this feature. But I consider this better than defininf a special syntaxt that would break compatibility with normal lua code.

## How to use

You literally just do ``if CRAFT_LOVE.<var> then end``...

Or `if CRAFT_LOVE.<var> > 0.5 then end`

[Example](#example) is also a pretty good usage demostration

But there is a flaw here, and this is very important. The processor currently goes line by line, lines are either kept or discarded. Doing an inline expression like the examples above won't work. I might fix this in the future but now I prefer to make sure everything works fine, just in case as this is a sensitive tool.

### Modes

When doing build mode, a copy of the project (except exclude files) is generated and all its lua files are proccessed. But, when using the run command in debug mode, it will just create a copy of your main.lua file, add the CRAFT_TABLE table to the top of the file and run it, then, when you close the windows it will restore the original file. This way running in debug is fast and... Everything works as if it was "compiled"! Because we're using lua syntaxt at the end. Of course running in debug is slower because of the extra checks you'll be doing in runtime. If you execute craftlove run in release, it will make a build and then run it.

## Under the hood

[luaProccessor](./src/luaProcessor.js) is a pretty naive "parser" if we can call it that. It loads the file as a stream, converting it to utf-8 and lf by default as the javascript regex won't work well witih CRLF files. Then it goes line by line until it finds an if statemente. Here there are two possible options:

- The if condition is a craft_love expression
- The if condition is a normal lua expression

In both cases, a structure is created for it:

```js
/**
 * Represents a block of Lua code (if-elseif-else).
 */
class ConditionalExpression {
  constructor(condition, body, elseIfBlocks = [], elseBlock = null, nextText = '') {
    this.condition = condition;
    this.body = body;
    this.elseIfBlocks = elseIfBlocks;
    this.elseBlock = elseBlock;
    this.nextText = nextText;
    this.is_craft_love = shouldProcessBlock(condition);
  }
}
```
The script finds the end of the if and builds all the else-if blocks in between. Then, if it's a craft_love expression, it will evaluate all conditions, the one that is true (or else if no one was) will be returned and that will be processed again to search for nested expressions until the end.

In non craft_love expressions, it will return the whole if but processing each body. So let's put this example:

```
if seomthing then
    body
else
    body2
end

nextText
```

Let's say something is a craft_love expression that is true. Then, the processing funtion will return

```
    process(body)

process(nextText)
```

As you can see, it only keeps the body of the true expression and removes everything else. If it was a non craft_love expression the return would be:

```
if seomthing then
    process(body)
else
    process(body2)
end

process(nextText)
```

Really simple logic that for now seems to be working well.


# Makelove compatibility

As of the current version, not all settings and features of makelove are present in craftlove. If there is a feature you need please file and issue and/or make a PR. Check [craftlove_full.toml](./craftlove_full.toml) to see available configuration parameters.

# Contributing

This project is open to contributions. As it's mainly a little tool I did for my specific needs, I don't plan to actively develop it, it already has what I need for my games.

For PRs, please try to specify what you're adding, why and an overview of the changes. Then provide a test configuration so I can make sure that everything works fine before merging. PR reviews and merge might take time depending on my circunstances.

# License

This project is under the [MIT License](./LICENSE)