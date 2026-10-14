from backend.server import _exclude_episode_guests_from_main_cast, _sanitize_episode_main_cast


def test_guest_star_stays_out_of_episode_main_cast():
    seasons = [{
        "season_number": 1,
        "episodes": [
            {
                "episode_number": 1,
                "main_cast_actor_ids": [],
                "guest_stars": [
                    {"actor_id": "promoted", "character_name": "Guest Role"},
                    {"actor_id": "guest-only", "character_name": "Guest"},
                ],
            },
            {
                "episode_number": 2,
                "main_cast_actor_ids": ["promoted"],
                "guest_stars": [{"actor_id": "promoted", "character_name": "Guest Role"}],
            },
        ],
    }]
    main_cast = [{"actor_id": "promoted", "character_name": "Series Role"}]

    result = _sanitize_episode_main_cast(seasons, main_cast)
    episodes = result[0]["episodes"]

    assert episodes[0]["main_cast_actor_ids"] == []
    assert episodes[0]["guest_stars"] == [
        {"actor_id": "promoted", "character_name": "Guest Role"},
        {"actor_id": "guest-only", "character_name": "Guest"},
    ]
    assert episodes[1]["main_cast_actor_ids"] == []
    assert episodes[1]["guest_stars"] == [{"actor_id": "promoted", "character_name": "Guest Role"}]


def test_episode_guest_is_removed_from_series_main_cast():
    main_cast = [
        {"actor_id": "guest", "character_name": "Guest Role"},
        {"actor_id": "lead", "character_name": "Lead Role"},
    ]
    seasons = [{"episodes": [{"guest_stars": [{"actor_id": "guest", "character_name": "Guest Role"}]}]}]

    assert _exclude_episode_guests_from_main_cast(main_cast, seasons) == [
        {"actor_id": "lead", "character_name": "Lead Role"},
    ]