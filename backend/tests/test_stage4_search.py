"""Stage 4 search acceptance against isolated real SQLite databases."""
from datetime import datetime, timezone

import pytest

from app.extensions import db
from app.models import Paper


@pytest.fixture()
def library(client, make_paper, app):
    tag = client.post('/api/tags', json={'name': '深度学习'}).json['data']['id']
    other = client.post('/api/tags', json={'name': '方法'}).json['data']['id']
    records = [
        make_paper(title='Transformer 中文 & 100%_+', authors='张三; Alice', year=2024,
                   research_topic='自然语言处理', reading_status='reading', tag_ids=[tag, other]),
        make_paper(title='Transformer 入门', authors='李四', year=2022,
                   research_topic='自然语言处理', reading_status='completed', tag_ids=[tag]),
        make_paper(title='图像分类', authors='张三', year=2024,
                   research_topic='计算机视觉', tag_ids=[other]),
        make_paper(title='未定年份', authors='Bob', year=None, research_topic='自然语言处理'),
    ]
    # 确定时间值，排序检查不依赖运行速度或秒级时间戳碰巧相同。
    with app.app_context():
        for index, record in enumerate(records):
            paper = db.session.get(Paper, record['id'])
            paper.created_at = datetime(2024, 1, index + 1, tzinfo=timezone.utc)
            paper.updated_at = datetime(2024, 2, 4 - index, tzinfo=timezone.utc)
        db.session.commit()
    return records, tag


def query(client, **filters):
    response = client.get('/api/papers', query_string=filters)
    assert response.status_code == 200, response.json
    return response.json['data']


@pytest.mark.parametrize('filters,indices', [
    ({'title': 'Transformer'}, [1, 0]),
    ({'author': '张三'}, [2, 0]),
    ({'year': 2024}, [2, 0]),
    ({'reading_status': 'completed'}, [1]),
    ({'research_topic': '自然语言处理'}, [3, 1, 0]),
    ({'title': '& 100%_+'}, [0]),
    ({'author': 'Alice'}, [0]),
])
def test_single_filters(client, library, filters, indices):
    records, _ = library
    result = query(client, **filters)
    assert [item['id'] for item in result['items']] == [records[i]['id'] for i in indices]
    assert result['total'] == len(indices)


def test_tag_and_all_conditions_intersect(client, library):
    records, tag = library
    assert query(client, tag_id=tag)['total'] == 2
    result = query(client, title='Transformer', author='张三', tag_id=tag, year=2024,
                   reading_status='reading', research_topic='自然语言处理', sort_by='year', sort_order='asc')
    assert [item['id'] for item in result['items']] == [records[0]['id']]
    assert result['total'] == 1  # 多标签文献不能重复计数。


def test_no_results_and_clear(client, library):
    for filters in ({'title': '不存在'}, {'title': 'Transformer', 'author': 'Bob'},
                    {'research_topic': '自然语言'}, {'tag_id': 999999}):
        result = query(client, **filters)
        assert result['items'] == [] and result['total'] == result['pages'] == 0
    assert query(client, page=1, page_size=20, sort_by='created_at', sort_order='desc')['total'] == 4


@pytest.mark.parametrize('sort_by,ascending', [
    ('year', [1, 0, 2, 3]), ('created_at', [0, 1, 2, 3]), ('updated_at', [3, 2, 1, 0]),
])
@pytest.mark.parametrize('direction', ['asc', 'desc'])
def test_sort_fields_both_directions(client, library, sort_by, ascending, direction):
    records, _ = library
    expected = ascending if direction == 'asc' else (
        list(reversed(ascending[:-1])) + [3] if sort_by == 'year' else list(reversed(ascending)))
    result = query(client, sort_by=sort_by, sort_order=direction)
    assert [item['id'] for item in result['items']] == [records[i]['id'] for i in expected]


def test_filtered_pagination_and_reset(client, library):
    records, tag = library
    first = query(client, tag_id=tag, page_size=1, page=1, sort_by='year', sort_order='asc')
    second = query(client, tag_id=tag, page_size=1, page=2, sort_by='year', sort_order='asc')
    assert first['total'] == second['total'] == 2 and first['pages'] == 2
    assert first['items'][0]['id'] == records[1]['id']
    assert second['items'][0]['id'] == records[0]['id']
    assert query(client, tag_id=tag, author='张三', page=1)['items'][0]['id'] == records[0]['id']
