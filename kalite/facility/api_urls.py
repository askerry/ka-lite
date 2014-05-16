from django.conf.urls import patterns, url, include

from .api_resources import FacilityGroupResource


urlpatterns = patterns(__package__ + '.api_views',
    # For user management
    url(r'^move_to_group$', 'move_to_group', {}, 'move_to_group'),
    url(r'^delete_users$', 'delete_users', {}, 'delete_users'),

    url(r'^facility_delete$', 'facility_delete', {}, 'facility_delete'),
    url(r'^facility_delete/(?P<facility_id>\w+)$', 'facility_delete', {}, 'facility_delete'),

    # For group management
    url(r'^groups/', include(FacilityGroupResource().urls)),
)
