"""第五阶段：真实 SQLite 聚合及写操作后的统计同步。"""
from collections import Counter


def assert_dashboard(client):
    papers = client.get('/api/papers?page_size=100').json['data']['items']
    response = client.get('/api/dashboard')
    assert response.status_code == 200
    data = response.json['data']
    statuses = Counter(p['reading_status'] for p in papers)
    years = Counter(p['year'] for p in papers)
    assert data['total'] == len(papers)
    for status in ('not_started', 'reading', 'completed'):
        assert data[status] == statuses[status]
    assert {r['status']: r['count'] for r in data['by_status']} == {
        s: statuses[s] for s in ('not_started', 'reading', 'completed')}
    assert data['by_year'] == [
        {'year': y, 'count': years[y]} for y in sorted(years, key=lambda y: (y is None, y or 0))]
    assert sum(r['count'] for r in data['by_year']) == data['total']
    assert sum(r['count'] for r in data['by_status']) == data['total']
    return data


def test_empty_dashboard(client):
    data = assert_dashboard(client)
    assert data['total'] == 0
    assert data['by_year'] == []


def test_aggregation_is_not_multiplied_by_tags_or_notes(client, make_paper):
    tags = [client.post('/api/tags', json={'name': name}).json['data']['id']
            for name in ('统计', '可视化')]
    for index, (status, year) in enumerate([
        ('completed', 2024), ('completed', 2024), ('reading', 2020), ('not_started', None)
    ]):
        paper = make_paper(title=f'统计验收 {index}', reading_status=status, year=year, tag_ids=tags)
        for content in ('第一条笔记', '第二条笔记'):
            assert client.post(f"/api/papers/{paper['id']}/notes", json={'content': content}).status_code == 201
    data = assert_dashboard(client)
    assert (data['total'], data['completed'], data['reading'], data['not_started']) == (4, 2, 1, 1)


def test_statistics_follow_create_status_year_and_delete(client, make_paper):
    assert_dashboard(client)
    paper = make_paper(title='动态统计', year=2023)
    assert assert_dashboard(client)['not_started'] == 1
    for status in ('reading', 'completed'):
        assert client.patch(f"/api/papers/{paper['id']}", json={'reading_status': status}).status_code == 200
        assert assert_dashboard(client)[status] == 1
    assert client.patch(f"/api/papers/{paper['id']}", json={'reading_status': 'not_started'}).status_code == 200
    assert assert_dashboard(client)['completed'] == 1  # 第六阶段：完成状态保持，不随回看退回。
    for year in (2025, None):
        assert client.patch(f"/api/papers/{paper['id']}", json={'year': year}).status_code == 200
        assert assert_dashboard(client)['by_year'] == [{'year': year, 'count': 1}]
    assert client.delete(f"/api/papers/{paper['id']}").status_code == 204
    assert assert_dashboard(client)['total'] == 0


def test_dashboard_includes_papers_beyond_first_page(client, make_paper):
    for index in range(25):
        make_paper(title=f'超过一页 {index}', year=2020 + index % 3,
                   reading_status=('not_started', 'reading', 'completed')[index % 3])
    assert len(client.get('/api/papers').json['data']['items']) == 20
    assert assert_dashboard(client)['total'] == 25
