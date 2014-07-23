from annoying.functions import get_object_or_None
from tastypie import fields
from tastypie.exceptions import NotFound
from tastypie.resources import ModelResource, Resource

from kalite.facility.models import Facility, FacilityGroup
from securesync.models import Zone


class FacilityResource(ModelResource):
    class Meta:
        queryset = Facility.objects.all()
        resource_name = 'facility'

    def obj_get_list(self, bundle, **kwargs):
        # Allow filtering facilities by zone
        zone_id = bundle.request.GET.get('zone_id')
        if zone_id:
            facility_list = Facility.objects.by_zone(get_object_or_None(Zone, id=zone_id))
        else:
            facility_list = Facility.objects.all()

        return facility_list


class GroupResource(ModelResource):
    class Meta:
        queryset = FacilityGroup.objects.all()
        resource_name = 'group'

    def obj_get_list(self, bundle, **kwargs):
        # Allow filtering groups by facility
        facility_id = bundle.request.GET.get('facility_id')
        if facility_id:
            group_list = FacilityGroup.objects.filter(facility__id=facility_id)
        else:
            group_list = FacilityGroup.objects.all()

        return group_list


# class PlaylistResource(Resource):

#     description = fields.CharField(attribute='description')
#     tag = fields.CharField(attribute='tag', null=True)
#     id = fields.CharField(attribute='id')
#     title = fields.CharField(attribute='title')
#     groups_assigned = fields.ListField(attribute='groups_assigned')
#     entries = fields.ListField(attribute='entries')

#     class Meta:
#         resource_name = 'playlist'
#         # Use plain python object first instead of full-blown Django ORM model
#         object_class = Playlist

#     def detail_uri_kwargs(self, bundle_or_obj):
#         kwargs = {}
#         if isinstance(bundle_or_obj, Playlist):
#             kwargs['pk'] = bundle_or_obj.id
#         else:
#             kwargs['pk'] = bundle_or_obj.obj.id

#         return kwargs

#     def get_object_list(self, request):
#         '''Get the list of playlists based from a request'''
#         playlists = None

#         # here, we limit the returned playlists depending on the logged in user's privileges

#         if not request.is_logged_in:
#             # not logged in, allow no playlists for them
#             playlists = []

#         elif request.is_logged_in and request.is_admin:  # either actual admin, or a teacher
#             # allow access to all playlists
#             playlists = Playlist.all()

#         elif request.is_logged_in and not request.is_admin:  # user is a student
#             # only allow them to access playlists that they're assigned to
#             playlists = Playlist.all()
#             group = request.session['facility_user'].group
#             playlist_mappings_for_user_group = PlaylistToGroupMapping.objects.filter(group=group).values('playlist').values()
#             playlist_ids_assigned = [mapping['playlist'] for mapping in playlist_mappings_for_user_group]
#             playlists = [pl for pl in playlists if pl.id in playlist_ids_assigned]

#         return playlists

#     def obj_get_list(self, bundle, **kwargs):
#         return self.get_object_list(bundle.request)

#     def obj_get(self, bundle, **kwargs):
#         playlists = Playlist.all()
#         pk = kwargs['pk']
#         video_dict = video_dict_by_video_id()
#         for playlist in playlists:
#             if str(playlist.id) == pk:
#                 playlist.entries = [PlaylistEntry.add_full_title_from_topic_tree(entry, video_dict) for entry in playlist.entries]
#                 return playlist
#         else:
#             raise NotFound('Playlist with pk %s not found' % pk)

#     def obj_create(self, request):
#         raise NotImplemented("Operation not implemented yet for playlists.")

#     def obj_update(self, bundle, **kwargs):
#         new_group_ids = set([group['id'] for group in bundle.data['groups_assigned']])
#         playlist = Playlist(**bundle.data)

#         # hack because playlist isn't a model yet: clear the
#         # playlist's groups, then read each one according to what was
#         # given in the request. The proper way is to just change the
#         # many-to-many relation in the ORM.
#         with inside_transaction():
#             PlaylistToGroupMapping.objects.filter(playlist=playlist.id).delete()
#             new_mappings = ([PlaylistToGroupMapping(group_id=group_id, playlist=playlist.id) for group_id in new_group_ids])
#             PlaylistToGroupMapping.objects.bulk_create(new_mappings)

#         return bundle

#     def obj_delete_list(self, request):
#         raise NotImplemented("Operation not implemented yet for playlists.")

#     def obj_delete(self, request):
#         raise NotImplemented("Operation not implemented yet for playlists.")

#     def rollback(self, request):
#         raise NotImplemented("Operation not implemented yet for playlists.")


# class QuizLogResource(ModelResource):

#     user = fields.ForeignKey(FacilityUserResource, 'user')

#     class Meta:
#         queryset = QuizLog.objects.all()
#         resource_name = 'quizlog'
#         filtering = {
#             "quiz": ('exact', ),
#             "user": ('exact', ),
#         }
#         authorization = UserObjectsOnlyAuthorization()
