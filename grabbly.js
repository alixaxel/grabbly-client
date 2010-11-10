//
// Scrabb.ly's  app.js  beautified here: http://paste.ly/1VuX
//

function assert(cond, msg) {
    if (!cond) {
        msg = msg || "Assert failed.";
        console.error(msg);
        throw msg;
    }
};


// Enable pusher logging - don't include this in production
Pusher.log = function() {
    if (window.console) {
        window.console.log.apply(window.console, arguments);
    }
};

// Flash fallback logging - don't include this in production
WEB_SOCKET_DEBUG = true;

//var pusher = new Pusher('e15691ac43beed2f6f95');
//pusher.subscribe('testota');
//pusher.bind('my_event', function(data) {
//    alert(data);
//});

var letter_score = {
    'о': 1, 'а': 1, 'е': 1, 'и': 1,
    'н': 2, 'т': 2, 'р': 2, 'с': 2,
    'л': 3, 'в': 3, 'к': 3, 'п': 3,
    'м': 4, 'у': 4, 'д': 4,
    'я': 5, 'ы': 5, 'ь': 5, 'з': 5,
    'б': 6, 'г': 6, 'й': 6, 'ч': 6,
    'ю': 7, 'х': 7, 'ж': 7, 'ш': 7,
    'ё': 8, 'ц': 8, 'щ': 8, 'ф': 8,
    'э': 9,
    'ъ': 10
};

function tile_to_element (tile) {
    var score = letter_score[tile.letter];
    var jq = $('<div class=tile><span class=letter>' + tile.letter + '</span><span class=score>' + (score || "?") + '</span></div>');
    console.assert(jq.length === 1);
    return jq[0];
}

function element_to_tile (elem) {
    var jq = $(elem);
    var letter = jq.children('.letter').text();
    return {
        letter: letter,
        score: letter_score[letter]
    }
}

var board = {
    element: $('.board')[0],
    SQUARE_SIZE: 50
};
board.b_center = {X: board.element.clientWidth / 2, Y: board.element.clientHeight / 2};

board.get = function (v_coord) {
    var el_id = coord.to_square_id(v_coord);
    return document.getElementById(el_id);
};

board.set = function (v_coord, letter, flags) {
    var el_id = coord.to_square_id(v_coord);
    var el = document.getElementById(el_id);
    if (el) {
        el.parentNode.removeChild(el);
    }

    var b_coord = coord.v_to_b(v_coord);

    var square_elem = document.createElement('div');
    square_elem.id = el_id;
    square_elem.className = 'square';
    square_elem.style.cssText = coord.to_css(b_coord);
    var inner_elem = document.createElement('div');
    inner_elem.className = 'inner';
    var tile_elem = tile_to_element({letter: letter});
    inner_elem.appendChild(tile_elem);
    square_elem.appendChild(inner_elem);
    board.element.appendChild(square_elem);

    return square_elem;
};

board.drop_tile = function (x, y, draggable) {
    // Special case when tile is dropped on bottom bar.
    var bar_jq = $('.bottombar');
    assert(bar_jq.length === 1);
    var bar_elem = bar_jq[0];

    if ((x >= bar_elem.offsetLeft) && (x <= bar_elem.offsetLeft + bar_elem.offsetWidth)
        && (y >= bar_elem.offsetTop) && (y <= bar_elem.offsetTop + bar_elem.offsetHeight)) {

        // Did you drag a "played" tile from board back to rack?
        if (draggable.filter('.play').length === 1) {
            rack.add_tile(element_to_tile(draggable));
            draggable.remove();
            rack.update_buttons_status();
        } else {
            // Dragged tile from rack to bottombar.
        }

        return false;
    }

    var b_coord = coord.p_to_b({X: x, Y: y});
    console.log(b_coord.X, b_coord.Y, draggable);

    var v_coord = coord.b_to_v(b_coord);

    // check if there is already something on that square
    var old_square = board.get(v_coord);
    if ($(old_square).find('.tile').length !== 0) {
        console.info("Эта клетка уже занята другой буквой.");
        return false;
    }

    var letter = $('.letter', draggable).text();
    var square_elem = board.set(v_coord, letter, '');
    $('.tile', square_elem).addClass('play').draggable({
        containment: 'body',
        revert: true,
        revertDuration: 10
    });
    rack.update_buttons_status();

    draggable.remove();
};

board.load_state = function (tiles) {
    assert(tiles);
    for (var i = 0; i < tiles.length; i++) {
        var row = tiles[i];
        board.set({X: row[0], Y: row[1]}, row[2], row[3]);
    }
};

board.look_at_center = function () {
    board.p_origin = {
        X: (-board.element.clientWidth / 2) + window.innerWidth / 2,
        Y: (-board.element.clientHeight / 2) + window.innerHeight / 2
    };
    board.element.style.cssText = coord.to_css(board.p_origin);
};


var rack = {};

rack.add_tile = function (tile) {
    var tile_elem = tile_to_element(tile);
    var rack_tiles = $('.rack .tiles');
    assert(rack_tiles.length === 1);
    rack_tiles.append(tile_elem);
};

rack.update_buttons_status = function () {
    var played_tiles = $('.board .tile.play');

    // recall and commit (add word) buttons are available when there are some .play tiles on board
    $('.rack .buttons .recall').toggleClass('disabled', played_tiles.length === 0);
    $('.rack .buttons .commit').toggleClass('disabled', played_tiles.length === 0);
};

rack.load_state = function (data) {
    assert(data);
    for (var i = 0; i < data.length; i++) {
        rack.add_tile({letter: data[i]});
    }
};


// There are different types of coordinates.
// This namespace contains helpers to translate between them.
// * virtual (v for short) are game coordinates. Sibling letters on board have adjacent
//   virtual coordinates. It is the only kind of coordinates server knows about.
//   Used for: drop tiles onto board, sending moves to server.
// * board (b for short) are board-relative coordinates. Things are becoming more complicated
//   because at different times, different virtual coordinates correspond to different board
//   coordinates. See also `board.v_center`. Used for: position squares on board.
// * page (p for short) are page-relative coordinates.
var coord = {};

coord.v_to_b = function (v) { return {
    X: (v.X - board.v_center.X) * board.SQUARE_SIZE + board.b_center.X,
    Y: (v.Y - board.v_center.Y) * board.SQUARE_SIZE + board.b_center.Y
}};

coord.b_to_v = function (b) { return {
    X: Math.floor((b.X - board.b_center.X) / board.SQUARE_SIZE) + board.v_center.X,
    Y: Math.floor((b.Y - board.b_center.Y) / board.SQUARE_SIZE) + board.v_center.Y
}};

coord.p_to_b = function (p) { return {
    X: p.X - board.element.offsetLeft,
    Y: p.Y - board.element.offsetTop
}};

coord.to_css = function (coord) {
    return " left: " + coord.X + "px; top: " + coord.Y + "px; ";
};

coord.to_square_id = function (v) {
    return 'sq_' + v.X + ',' + v.Y;
};


$('.board').droppable({
    accept: '.tile',
    drop: function (_e, ui) {
        var coord = ui.draggable.offset();
        coord.top += ui.draggable.width() / 2;
        coord.left += ui.draggable.height() / 2;
        return board.drop_tile(coord.left, coord.top, ui.draggable);
    },
});
$('.board').draggable();

$('.rack .tiles').sortable({
    items: ".tile",
    containment: "body",
    placeholder: "tile-placeholder",
    forcePlaceholderSize: true,
    revert: true,
    revertDuration: 10,
    scroll: false,
});

$('.rack .buttons .recall').click(function () {
    $('.board .tile.play').each(function (_i, elem) {
        rack.add_tile(element_to_tile(elem));
        $(elem).remove();
        rack.update_buttons_status();
    });
});


// debugging mark
var board_center_mark = document.createElement('span');
board_center_mark.textContent = "+";
board_center_mark.style.cssText = "position: absolute; " + coord.to_css(board.b_center) + "font-size: 40px; font-weight: bold; color: gray; opacity: 0.5;";
board.element.appendChild(board_center_mark);


// temp stub
var example_start = {
    position: {X: 16, Y: 6},
    board: [ [10, 01, 'б', ''], [11, 01, 'л', ''], [12, 01, 'о', ''], [13, 01, 'к', ''], [14, 01, 'а', ''], [15, 01, 'д', ''], [16, 01, 'а', ''],
             [10, 02, 'а', ''], [12, 02, 'к', ''], [16, 02, 'з', ''], [17, 02, 'и', ''], [18, 02, 'м', ''], [19, 02, 'а', ''],
             [10, 03, 'р', ''], [12, 03, 'о', ''], [13, 03, 'к', ''], [14, 03, 'н', ''], [15, 03, 'о', ''],
             [10, 04, 'с', ''], [13, 04, 'а', ''],
             [13, 05, 'р', ''], [14, 05, 'а', ''], [15, 05, 'й', '']
           ],
    inventory: "йхкуяин",
    lives: 3,
    score: 0
};


$.getJSON("/game/start", function (d, status, _xhr) {
    assert(d);
    board.v_center = d.position || example_start.position;
    board.look_at_center();
    board.load_state(d.board || example_start.board);
    rack.load_state(d.inventory || example_start.inventory);
});
