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
